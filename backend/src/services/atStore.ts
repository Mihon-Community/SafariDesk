import type { Pool, PoolClient } from "pg";

export type SmsPreferenceChange = "opt_in" | "opt_out" | null;

export interface InboundSmsRecord {
  providerMessageId: string;
  senderHash: string;
  command: string;
  receivedAt: Date;
}

export interface UssdSessionRecord {
  sessionId: string;
  phoneHash: string;
  serviceCode: string;
  inputText: string;
  responseText: string;
  expiresAt: Date;
  updatedAt: Date;
}

export interface SmsSubmissionRecord {
  providerMessageId: string;
  recipientHash: string;
  apiStatus: string;
  apiStatusCode: number | null;
  cost: string | null;
  submittedAt: Date;
}

export interface SmsDeliveryReport {
  providerMessageId: string;
  status: string;
  failureReason: string | null;
  networkCode: string | null;
  recipientHash: string | null;
  receivedAt: Date;
}

export interface StoredSmsRecord {
  providerMessageId: string;
  recipientHash: string | null;
  apiStatus: string | null;
  apiStatusCode: number | null;
  cost: string | null;
  deliveryStatus: string | null;
  failureReason: string | null;
  networkCode: string | null;
  submittedAt: Date | null;
  reportReceivedAt: Date | null;
}

export interface AtStore {
  /** Insert once; preference changes and the idempotency claim are atomic. */
  acceptInboundSms(record: InboundSmsRecord, preference: SmsPreferenceChange): Promise<boolean>;
  isOptedOut(phoneHash: string): Promise<boolean>;
  getUssdSession(sessionId: string): Promise<UssdSessionRecord | null>;
  saveUssdSession(session: UssdSessionRecord): Promise<void>;
  saveSmsSubmission(record: SmsSubmissionRecord): Promise<void>;
  applyDeliveryReport(report: SmsDeliveryReport): Promise<void>;
}

/** Small in-memory implementation for tests and zero-config local development. */
export class MemoryAtStore implements AtStore {
  private readonly inbound = new Set<string>();
  private readonly optedOut = new Set<string>();
  private readonly sessions = new Map<string, UssdSessionRecord>();
  private readonly messages = new Map<string, StoredSmsRecord>();

  async acceptInboundSms(record: InboundSmsRecord, preference: SmsPreferenceChange): Promise<boolean> {
    if (this.inbound.has(record.providerMessageId)) return false;
    this.inbound.add(record.providerMessageId);
    if (preference === "opt_out") this.optedOut.add(record.senderHash);
    if (preference === "opt_in") this.optedOut.delete(record.senderHash);
    return true;
  }

  async isOptedOut(phoneHash: string): Promise<boolean> {
    return this.optedOut.has(phoneHash);
  }

  async getUssdSession(sessionId: string): Promise<UssdSessionRecord | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async saveUssdSession(session: UssdSessionRecord): Promise<void> {
    this.sessions.set(session.sessionId, session);
  }

  async saveSmsSubmission(record: SmsSubmissionRecord): Promise<void> {
    const current = this.messages.get(record.providerMessageId);
    this.messages.set(record.providerMessageId, {
      providerMessageId: record.providerMessageId,
      recipientHash: record.recipientHash,
      apiStatus: record.apiStatus,
      apiStatusCode: record.apiStatusCode,
      cost: record.cost,
      deliveryStatus: current?.deliveryStatus ?? null,
      failureReason: current?.failureReason ?? null,
      networkCode: current?.networkCode ?? null,
      submittedAt: record.submittedAt,
      reportReceivedAt: current?.reportReceivedAt ?? null,
    });
  }

  async applyDeliveryReport(report: SmsDeliveryReport): Promise<void> {
    const current = this.messages.get(report.providerMessageId);
    this.messages.set(report.providerMessageId, {
      providerMessageId: report.providerMessageId,
      recipientHash: report.recipientHash ?? current?.recipientHash ?? null,
      apiStatus: current?.apiStatus ?? null,
      apiStatusCode: current?.apiStatusCode ?? null,
      cost: current?.cost ?? null,
      deliveryStatus: report.status,
      failureReason: report.failureReason,
      networkCode: report.networkCode,
      submittedAt: current?.submittedAt ?? null,
      reportReceivedAt: report.receivedAt,
    });
  }

  /** Test helper; never expose this outside the test process. */
  getStoredSms(providerMessageId: string): StoredSmsRecord | null {
    return this.messages.get(providerMessageId) ?? null;
  }

  hasInboundSms(providerMessageId: string): boolean {
    return this.inbound.has(providerMessageId);
  }
}

/** PostgreSQL implementation used whenever DATABASE_URL is configured. */
export class PgAtStore implements AtStore {
  constructor(private readonly pool: Pool) {}

  private async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async acceptInboundSms(record: InboundSmsRecord, preference: SmsPreferenceChange): Promise<boolean> {
    return this.withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO at_inbound_sms (provider_message_id, sender_hash, command, received_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (provider_message_id) DO NOTHING
         RETURNING provider_message_id`,
        [record.providerMessageId, record.senderHash, record.command, record.receivedAt],
      );
      if (!inserted.rowCount) return false;

      if (preference !== null) {
        await client.query(
          `INSERT INTO at_sms_preferences (phone_hash, opted_out, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (phone_hash) DO UPDATE
           SET opted_out = EXCLUDED.opted_out, updated_at = now()`,
          [record.senderHash, preference === "opt_out"],
        );
      }
      return true;
    });
  }

  async isOptedOut(phoneHash: string): Promise<boolean> {
    const result = await this.pool.query<{ opted_out: boolean }>(
      `SELECT opted_out FROM at_sms_preferences WHERE phone_hash = $1`,
      [phoneHash],
    );
    return result.rows[0]?.opted_out ?? false;
  }

  async getUssdSession(sessionId: string): Promise<UssdSessionRecord | null> {
    const result = await this.pool.query<{
      session_id: string;
      phone_hash: string;
      service_code: string;
      input_text: string;
      response_text: string;
      expires_at: Date;
      updated_at: Date;
    }>(
      `SELECT session_id, phone_hash, service_code, input_text, response_text, expires_at, updated_at
       FROM at_ussd_sessions WHERE session_id = $1`,
      [sessionId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      sessionId: row.session_id,
      phoneHash: row.phone_hash,
      serviceCode: row.service_code,
      inputText: row.input_text,
      responseText: row.response_text,
      expiresAt: new Date(row.expires_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async saveUssdSession(session: UssdSessionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO at_ussd_sessions
         (session_id, phone_hash, service_code, input_text, response_text, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (session_id) DO UPDATE SET
         phone_hash = EXCLUDED.phone_hash,
         service_code = EXCLUDED.service_code,
         input_text = EXCLUDED.input_text,
         response_text = EXCLUDED.response_text,
         expires_at = EXCLUDED.expires_at,
         updated_at = EXCLUDED.updated_at`,
      [
        session.sessionId,
        session.phoneHash,
        session.serviceCode,
        session.inputText,
        session.responseText,
        session.expiresAt,
        session.updatedAt,
      ],
    );
  }

  async saveSmsSubmission(record: SmsSubmissionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO at_sms_messages
         (provider_message_id, recipient_hash, api_status, api_status_code, cost, submitted_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (provider_message_id) DO UPDATE SET
         recipient_hash = EXCLUDED.recipient_hash,
         api_status = EXCLUDED.api_status,
         api_status_code = EXCLUDED.api_status_code,
         cost = EXCLUDED.cost,
         submitted_at = EXCLUDED.submitted_at,
         updated_at = now()`,
      [
        record.providerMessageId,
        record.recipientHash,
        record.apiStatus,
        record.apiStatusCode,
        record.cost,
        record.submittedAt,
      ],
    );
  }

  async applyDeliveryReport(report: SmsDeliveryReport): Promise<void> {
    await this.pool.query(
      `INSERT INTO at_sms_messages
         (provider_message_id, recipient_hash, delivery_status, failure_reason, network_code,
          report_received_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (provider_message_id) DO UPDATE SET
         recipient_hash = COALESCE(EXCLUDED.recipient_hash, at_sms_messages.recipient_hash),
         delivery_status = EXCLUDED.delivery_status,
         failure_reason = EXCLUDED.failure_reason,
         network_code = EXCLUDED.network_code,
         report_received_at = EXCLUDED.report_received_at,
         updated_at = now()`,
      [
        report.providerMessageId,
        report.recipientHash,
        report.status,
        report.failureReason,
        report.networkCode,
        report.receivedAt,
      ],
    );
  }
}
