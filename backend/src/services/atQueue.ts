import { logger } from "../logger";
import type { AtSmsGateway } from "./at";

export interface SmsReplyJob {
  recipient: string;
  message: string;
  bypassOptOut?: boolean;
}

export interface SmsReplyQueue {
  enqueue(job: SmsReplyJob): void;
}

/** Small serialized background queue for short callback replies. The callback
 * event is persisted before a job is enqueued and acknowledged to AT. */
export class AtSmsReplyQueue implements SmsReplyQueue {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly gateway: AtSmsGateway) {}

  enqueue(job: SmsReplyJob): void {
    this.tail = this.tail
      .then(async () => {
        const outcome = await this.gateway.sendText(job.recipient, job.message, {
          ...(job.bypassOptOut !== undefined ? { bypassOptOut: job.bypassOptOut } : {}),
        });
        if (!outcome.accepted) {
          logger.info({ result: outcome.reason ?? "failed" }, "Africa's Talking reply was not sent");
        }
      })
      .catch(() => {
        logger.warn({ result: "queue_error" }, "Africa's Talking reply queue failed");
      });
  }

  async drain(): Promise<void> {
    await this.tail;
  }
}
