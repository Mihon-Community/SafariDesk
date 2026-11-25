import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { logger } from "../logger";
import { isKenyanE164Phone } from "../lib/phone";
import type { DeliveryEvent } from "../auth/service";
import type { AtStore } from "./atStore";

export interface AtSettings {
  username: string;
  apiKey: string;
  senderId: string;
  testPhone: string;
  ussdServiceCode: string;
  allowedPhones: readonly string[];
  webhookToken: string;
  publicBaseUrl: string;
  publicAppUrl: string;
}

export interface SmsRecipientResult {
  messageId: string | null;
  status: string;
  statusCode: number | null;
  cost: string | null;
}

export interface SmsSendOutcome {
  accepted: boolean;
  reason?: "not_configured" | "invalid_phone" | "not_allowed" | "opted_out" | "provider_error" | undefined;
  recipients: SmsRecipientResult[];
}

interface AtRecipientResponse {
  messageId?: unknown;
  status?: unknown;
  statusCode?: unknown;
  cost?: unknown;
}

interface AtSmsResponse {
  SMSMessageData?: { Recipients?: unknown };
}

interface AtSdk {
  SMS: {
    send(options: { to: string[]; message: string; senderId?: string }): Promise<AtSmsResponse>;
  };
}

export type AtSdkFactory = (credentials: { username: string; apiKey: string }) => AtSdk;

const require = createRequire(__filename);
const defaultFactory: AtSdkFactory = (credentials) => {
  const createSdk = require("africastalking") as (options: typeof credentials) => AtSdk;
  return createSdk(credentials);
};

function safeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function responseRecipients(value: unknown): AtRecipientResponse[] {
  return Array.isArray(value) ? value.filter((item): item is AtRecipientResponse => Boolean(item && typeof item === "object")) : [];
}

export function phoneReference(phone: string, secret: string): string {
  return createHmac("sha256", secret).update(phone).digest("hex");
}

export function cleanSmsText(message: string): string | null {
  const clean = message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (!clean || clean.length > 480) return null;
  return clean;
}

export class AtSmsGateway {
  private client: AtSdk | null = null;

  constructor(
    private readonly settings: AtSettings,
    private readonly store: AtStore,
    private readonly factory: AtSdkFactory = defaultFactory,
  ) {}

  async sendText(
    phoneInput: string,
    message: string,
    options: { bypassOptOut?: boolean } = {},
  ): Promise<SmsSendOutcome> {
    const phone = phoneInput.trim();
    if (!isKenyanE164Phone(phone)) return { accepted: false, reason: "invalid_phone", recipients: [] };
    if (this.settings.allowedPhones.length && !this.settings.allowedPhones.includes(phone)) {
      return { accepted: false, reason: "not_allowed", recipients: [] };
    }
    if (!options.bypassOptOut && this.settings.webhookToken) {
      if (await this.store.isOptedOut(phoneReference(phone, this.settings.webhookToken))) {
        return { accepted: false, reason: "opted_out", recipients: [] };
      }
    }
    const body = cleanSmsText(message);
    if (!body) return { accepted: false, reason: "provider_error", recipients: [] };
    if (!this.settings.username || !this.settings.apiKey) {
      return { accepted: false, reason: "not_configured", recipients: [] };
    }

    try {
      this.client ??= this.factory({ username: this.settings.username, apiKey: this.settings.apiKey });
      const response = await this.client.SMS.send({
        to: [phone],
        message: body,
        ...(this.settings.senderId ? { senderId: this.settings.senderId } : {}),
      });
      const recipients = responseRecipients(response?.SMSMessageData?.Recipients).map((item) => {
        const statusCodeValue = Number(item.statusCode);
        const statusCode = Number.isFinite(statusCodeValue) ? statusCodeValue : null;
        return {
          messageId: safeString(item.messageId, 120),
          status: safeString(item.status, 40) ?? (statusCode === null ? "Unknown" : String(statusCode)),
          statusCode,
          cost: safeString(item.cost, 32),
        };
      });
      if (!recipients.length) {
        logger.warn({ result: "missing_recipient_result" }, "Africa's Talking SMS response was incomplete");
        return { accepted: false, reason: "provider_error", recipients: [] };
      }

      for (const recipient of recipients) {
        if (recipient.messageId) {
          await this.store.saveSmsSubmission({
            providerMessageId: recipient.messageId,
            recipientHash: phoneReference(phone, this.settings.webhookToken || this.settings.apiKey),
            apiStatus: recipient.status,
            apiStatusCode: recipient.statusCode,
            cost: recipient.cost,
            submittedAt: new Date(),
          });
        }
      }
      const accepted = recipients.every((recipient) =>
        recipient.statusCode !== null && [100, 101, 102].includes(recipient.statusCode),
      );
      if (!accepted) logger.warn({ result: "provider_rejected", statusCode: recipients[0]?.statusCode ?? null }, "Africa's Talking rejected an SMS");
      return accepted
        ? { accepted: true, recipients }
        : { accepted: false, reason: "provider_error", recipients };
    } catch {
      // SDK errors can include request bodies, phone numbers, and provider data.
      logger.warn({ result: "provider_error" }, "Africa's Talking SMS request failed");
      return { accepted: false, reason: "provider_error", recipients: [] };
    }
  }

  async sendSandboxTest(phone: string): Promise<SmsSendOutcome> {
    if (this.settings.username !== "sandbox") {
      throw new Error("AT sandbox test send is disabled unless AT_USERNAME is sandbox.");
    }
    if (!this.settings.testPhone || phone !== this.settings.testPhone) {
      throw new Error("AT sandbox test send requires the configured AT_TEST_PHONE.");
    }
    return this.sendText(phone, "SafariDesk Africa's Talking sandbox test message.");
  }
}

export function authSmsBody(event: DeliveryEvent, publicAppUrl: string): string | null {
  const base = publicAppUrl.replace(/\/$/, "");
  switch (event.kind) {
    case "password_reset":
      if (!base) return null;
      return `SafariDesk password reset: ${base}/reset-password?token=${encodeURIComponent(event.token)}. Expires soon. If you did not request this, ignore it.`;
    case "invite":
      if (!base) return null;
      return `SafariDesk ${event.role} invite: ${base}/accept-invite?token=${encodeURIComponent(event.token)}. Expires ${event.expiresAt.toISOString().slice(0, 10)}.`;
    case "request_approved":
      return `SafariDesk: your ${event.role} access request was approved. You can now sign in.`;
    case "request_rejected":
      return "SafariDesk: your access request was not approved. Contact your administrator for details.";
  }
}

export class AuthSmsDelivery {
  constructor(private readonly gateway: AtSmsGateway, private readonly publicAppUrl: string) {}

  async deliver(event: DeliveryEvent): Promise<void> {
    if (!event.phone) {
      logger.info({ event: event.kind, result: "no_phone" }, "Africa's Talking auth SMS skipped");
      return;
    }
    const body = authSmsBody(event, this.publicAppUrl);
    if (!body) {
      logger.info({ event: event.kind, result: "no_public_app_url" }, "Africa's Talking auth SMS skipped");
      return;
    }
    const result = await this.gateway.sendText(event.phone, body);
    logger.info({ event: event.kind, result: result.accepted ? "accepted" : result.reason ?? "failed" }, "Africa's Talking auth SMS result");
  }
}
