import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import rateLimit from "express-rate-limit";
import { isKenyanE164Phone } from "../lib/phone";
import { requireWebhookSecret, sendUssdEnd } from "../middleware/webhookSecret";
import { logger } from "../logger";
import { phoneReference } from "../services/at";
import type { AtStore, SmsPreferenceChange } from "../services/atStore";
import type { SmsReplyQueue } from "../services/atQueue";

export interface AfricaTalkingWebhookOptions {
  webhookToken: string;
  ussdServiceCode: string;
  allowedPhones: readonly string[];
  publicAppUrl: string;
  store: AtStore;
  replyQueue: SmsReplyQueue;
  rateLimitPerMinute?: number;
  sessionTtlMs?: number;
  now?: () => Date;
}

class InvalidForm extends Error {}

const ussdFields = new Set(["sessionId", "serviceCode", "phoneNumber", "text", "networkCode"]);
const inboundSmsFields = new Set(["id", "messageId", "from", "to", "text", "linkId", "date", "networkCode", "retryCount"]);
const reportFields = new Set(["id", "messageId", "status", "phoneNumber", "networkCode", "failureReason", "failureCode", "retryCount"]);

function field(body: unknown, name: string, maxLength: number, required = true): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new InvalidForm();
  const value = (body as Record<string, unknown>)[name];
  if (value === undefined && !required) return null;
  // Express represents duplicate form keys as arrays. Reject instead of
  // guessing which value Africa's Talking intended.
  if (typeof value !== "string" || value.length > maxLength || (required && value.length === 0)) {
    throw new InvalidForm();
  }
  return value;
}

function validateKnownFields(body: unknown, allowed: Set<string>): void {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new InvalidForm();
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (!allowed.has(key) || typeof value !== "string") throw new InvalidForm();
  }
}

const formParser = express.urlencoded({ extended: false, limit: "8kb", parameterLimit: 16 });

const requireFormContentType: RequestHandler = (req, res, next) => {
  if (!req.is("application/x-www-form-urlencoded")) {
    if (req.path === "/ussd") {
      sendUssdEnd(res, "Invalid callback format.", 415);
      return;
    }
    res.status(415).json({ error: "Expected a URL-encoded callback.", code: "UNSUPPORTED_CALLBACK_TYPE" });
    return;
  }
  next();
};

function callbackRateLimit(perMinute: number): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: Math.max(1, perMinute),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler(req, res) {
      if (req.path === "/ussd") sendUssdEnd(res, "Please try again shortly.", 429);
      else res.status(429).type("text/plain").send("Too many callback requests.");
    },
  });
}

function allowedPhone(phone: string, configured: readonly string[]): boolean {
  return configured.length === 0 || configured.includes(phone);
}

function menuResponse(text: string, publicAppUrl: string): string {
  const url = publicAppUrl.replace(/\/$/, "");
  if (text === "") return "CON SafariDesk\n1. Browse safari options\n2. Booking help\n0. Exit";
  const selections = text.split("*");
  if (
    selections.length > 4 ||
    selections.some((selection) => !/^\d{1,2}$/.test(selection))
  ) return "END Invalid selection. Dial again to restart.";
  if (new Set(selections).size !== selections.length) return "END That selection was repeated. Dial again to restart.";
  if (text === "0") return "END Thank you for using SafariDesk.";
  if (text === "1") {
    return url
      ? `END Browse safari options at ${url}/parks.`
      : "END Contact your safari operator for current trip options.";
  }
  if (text === "2") return "END For booking help, contact your safari operator. Text HELP for SMS assistance.";
  return "END Invalid selection. Dial again to restart.";
}

export function classifyInboundSms(
  text: string,
  publicAppUrl = "",
): { command: string; reply: string; preference: SmsPreferenceChange; bypassOptOut: boolean } {
  const commandText = text.trim().toUpperCase();
  if (["STOP", "UNSUBSCRIBE", "CANCEL", "QUIT", "END"].includes(commandText)) {
    return {
      command: "STOP",
      reply: "SafariDesk SMS updates are stopped. Text START to re-enable service messages.",
      preference: "opt_out",
      bypassOptOut: true,
    };
  }
  if (commandText === "START") {
    return {
      command: "START",
      reply: "SafariDesk service SMS is enabled. Text HELP for options.",
      preference: "opt_in",
      bypassOptOut: true,
    };
  }
  if (commandText === "BOOK") {
    const appUrl = publicAppUrl.replace(/\/$/, "");
    return {
      command: "BOOK",
      reply: appUrl
        ? `Browse safari options at ${appUrl}/parks. Contact your operator to complete a booking.`
        : "To browse safari options, visit the SafariDesk website or contact your safari operator.",
      preference: null,
      bypassOptOut: false,
    };
  }
  return {
    command: commandText === "HELP" ? "HELP" : "OTHER",
    reply: "SafariDesk: text BOOK for safari options. Text STOP to stop service SMS or START to re-enable.",
    preference: null,
    bypassOptOut: false,
  };
}

function normalizeReportStatus(input: string): string | null {
  const statuses: Record<string, string> = {
    sent: "Sent",
    submitted: "Submitted",
    buffered: "Buffered",
    success: "Success",
    delivered: "Success",
    rejected: "Rejected",
    failed: "Failed",
    expired: "Expired",
  };
  return statuses[input.trim().toLowerCase()] ?? null;
}

const failureReasons = new Set([
  "DeliveryFailure",
  "InsufficientCredit",
  "InvalidLinkId",
  "UserIsInactive",
  "UserInBlacklist",
  "UserAccountSuspended",
  "NotNetworkSubscriber",
  "UserNotSubscribedToProduct",
  "UserDoesNotExist",
]);

function normalizeFailureReason(input: string | null): string | null {
  if (!input) return null;
  const match = [...failureReasons].find((reason) => reason.toLowerCase() === input.toLowerCase());
  return match ?? "Other";
}

function isProviderId(value: string): boolean {
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(value);
}

export function africaTalkingWebhookRouter(options: AfricaTalkingWebhookOptions): Router {
  const router = Router();
  router.use(callbackRateLimit(options.rateLimitPerMinute ?? 120));

  router.post(
    "/ussd",
    requireWebhookSecret(options.webhookToken),
    requireFormContentType,
    formParser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        validateKnownFields(req.body, ussdFields);
        const sessionId = field(req.body, "sessionId", 128)!;
        const serviceCode = field(req.body, "serviceCode", 32)!;
        const phone = field(req.body, "phoneNumber", 16)!;
        const text = field(req.body, "text", 160, false) ?? "";
        const networkCode = field(req.body, "networkCode", 32, false);
        void networkCode;

        if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(sessionId) || !isKenyanE164Phone(phone)) {
          sendUssdEnd(res, "Invalid session. Dial again to restart.", 400);
          return;
        }
        if (!options.ussdServiceCode) {
          sendUssdEnd(res, "USSD is not configured yet.", 503);
          return;
        }
        if (serviceCode !== options.ussdServiceCode || !allowedPhone(phone, options.allowedPhones)) {
          sendUssdEnd(res, "This service is unavailable for this number.", 403);
          return;
        }

        const now = (options.now ?? (() => new Date()))();
        const phoneHash = phoneReference(phone, options.webhookToken);
        const existing = await options.store.getUssdSession(sessionId);
        let responseText: string;
        if (existing && existing.expiresAt.getTime() > now.getTime()) {
          if (existing.phoneHash !== phoneHash || existing.serviceCode !== serviceCode) {
            sendUssdEnd(res, "Invalid session. Dial again to restart.", 400);
            return;
          }
          responseText = existing.inputText === text ? existing.responseText : menuResponse(text, options.publicAppUrl);
        } else if (existing && text !== "") {
          responseText = "END Session expired. Dial again to restart.";
        } else {
          responseText = menuResponse(text, options.publicAppUrl);
        }

        const sessionTtl = options.sessionTtlMs ?? 5 * 60_000;
        await options.store.saveUssdSession({
          sessionId,
          phoneHash,
          serviceCode,
          inputText: text,
          responseText,
          expiresAt: new Date(now.getTime() + sessionTtl),
          updatedAt: now,
        });
        res.status(200).type("text/plain; charset=utf-8").send(responseText);
      } catch (error) {
        if (error instanceof InvalidForm) {
          sendUssdEnd(res, "Invalid request. Dial again to restart.", 400);
          return;
        }
        logger.error({ path: "/ussd", result: "storage_error" }, "Africa's Talking USSD callback could not be persisted");
        next(error);
      }
    },
  );

  router.post(
    "/webhook/incoming",
    requireWebhookSecret(options.webhookToken),
    requireFormContentType,
    formParser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        validateKnownFields(req.body, inboundSmsFields);
        const id = field(req.body, "id", 120, false);
        const messageId = field(req.body, "messageId", 120, false);
        if (id && messageId) throw new InvalidForm();
        const providerMessageId = id ?? messageId;
        const from = field(req.body, "from", 16)!;
        const text = field(req.body, "text", 480)!;
        const to = field(req.body, "to", 32, false);
        const linkId = field(req.body, "linkId", 64, false);
        const date = field(req.body, "date", 64, false);
        const networkCode = field(req.body, "networkCode", 32, false);
        const retryCount = field(req.body, "retryCount", 8, false);
        void to;
        void linkId;
        void date;
        void networkCode;
        void retryCount;

        if (!providerMessageId || !isProviderId(providerMessageId) || !isKenyanE164Phone(from)) {
          res.status(400).json({ error: "Malformed SMS callback.", code: "INVALID_CALLBACK" });
          return;
        }
        if (!allowedPhone(from, options.allowedPhones)) {
          res.status(403).json({ error: "Sender not allowed.", code: "PHONE_NOT_ALLOWED" });
          return;
        }

        const command = classifyInboundSms(text, options.publicAppUrl);
        const senderHash = phoneReference(from, options.webhookToken);
        const inserted = await options.store.acceptInboundSms(
          { providerMessageId, senderHash, command: command.command, receivedAt: (options.now ?? (() => new Date()))() },
          command.preference,
        );
        if (inserted) {
          const optedOut = command.command !== "START" && command.command !== "STOP"
            ? await options.store.isOptedOut(senderHash)
            : false;
          if (!optedOut) {
            options.replyQueue.enqueue({
              recipient: from,
              message: command.reply,
              bypassOptOut: command.bypassOptOut,
            });
          }
        }
        // AT retries incoming SMS until it receives HTTP 200. The message ID
        // is stored before acknowledgement so retries never duplicate a reply.
        res.status(200).type("text/plain; charset=utf-8").send("OK");
      } catch (error) {
        if (error instanceof InvalidForm) {
          res.status(400).json({ error: "Malformed SMS callback.", code: "INVALID_CALLBACK" });
          return;
        }
        logger.error({ path: "/webhook/incoming", result: "storage_error" }, "Africa's Talking SMS callback could not be persisted");
        next(error);
      }
    },
  );

  router.post(
    "/api/webhooks/africastalking/sms-status",
    requireWebhookSecret(options.webhookToken, true),
    requireFormContentType,
    formParser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        validateKnownFields(req.body, reportFields);
        const id = field(req.body, "id", 120, false);
        const messageId = field(req.body, "messageId", 120, false);
        if (id && messageId) throw new InvalidForm();
        const providerMessageId = id ?? messageId;
        const statusInput = field(req.body, "status", 40)!;
        const phone = field(req.body, "phoneNumber", 16, false);
        const networkCode = field(req.body, "networkCode", 32, false);
        const failureReason = field(req.body, "failureReason", 80, false);
        const failureCode = field(req.body, "failureCode", 32, false);
        const retryCount = field(req.body, "retryCount", 8, false);
        void failureCode;
        void retryCount;

        const status = normalizeReportStatus(statusInput);
        if (!providerMessageId || !isProviderId(providerMessageId) || !status) {
          res.status(400).json({ error: "Malformed delivery report.", code: "INVALID_CALLBACK" });
          return;
        }
        if (phone && (!isKenyanE164Phone(phone) || !allowedPhone(phone, options.allowedPhones))) {
          res.status(403).json({ error: "Recipient not allowed.", code: "PHONE_NOT_ALLOWED" });
          return;
        }

        await options.store.applyDeliveryReport({
          providerMessageId,
          status,
          failureReason: normalizeFailureReason(failureReason),
          networkCode: networkCode && /^[A-Za-z0-9_-]{1,32}$/.test(networkCode) ? networkCode : null,
          recipientHash: phone ? phoneReference(phone, options.webhookToken) : null,
          receivedAt: (options.now ?? (() => new Date()))(),
        });
        res.status(200).type("text/plain; charset=utf-8").send("OK");
      } catch (error) {
        if (error instanceof InvalidForm) {
          res.status(400).json({ error: "Malformed delivery report.", code: "INVALID_CALLBACK" });
          return;
        }
        logger.error({ path: "/api/webhooks/africastalking/sms-status", result: "storage_error" }, "Africa's Talking delivery report could not be persisted");
        next(error);
      }
    },
  );

  return router;
}
