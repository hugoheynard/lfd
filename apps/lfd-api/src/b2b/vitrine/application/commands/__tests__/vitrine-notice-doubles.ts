import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import {
  type VitrineNoticeEntry,
  VitrineNoticeReader,
} from "../../../domain/ports/vitrine-notice.reader.js";
import {
  type VitrineNoticeOpening,
  VitrineNoticeRepository,
} from "../../../domain/ports/vitrine-notice.repository.js";
import { VitrineNotice, type VitrineNoticeRow } from "../../../domain/vitrine-notice.js";
import type { VitrineNoticeCandidate } from "../../../domain/vitrine-notice-audience.js";

export const CANDIDATES: readonly VitrineNoticeCandidate[] = [
  { subscriberId: "s1", name: "Agence", contactEmail: "web@agence.fr" },
  { subscriberId: "s2", name: "Muette", contactEmail: null },
  { subscriberId: "s3", name: "Coupée", contactEmail: "coupee@agence.fr" },
];

export class RecordingMailer implements B2bMailer {
  readonly sent: SendMailArgs<B2bMails>[] = [];
  readonly refused = new Set<string>();

  constructor(readonly enabled = true) {}

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    if (this.refused.has(args.to)) {
      return Promise.reject(new Error("refus du fournisseur"));
    }
    this.sent.push(args);
    return Promise.resolve({ providerId: "re_1" });
  }
}

export class MemoryNotices extends VitrineNoticeRepository {
  readonly rows = new Map<string, VitrineNoticeRow>();
  /** Simule un second clic qui a pris la clé entre la lecture et l'écriture. */
  raceWinner: string | null = null;

  idOfKey(key: string): Promise<string | null> {
    const found = [...this.rows.values()].find((row) => row.idempotencyKey === key);
    return Promise.resolve(found?.id ?? null);
  }

  open(notice: VitrineNotice): Promise<VitrineNoticeOpening> {
    if (this.raceWinner !== null) {
      return Promise.resolve({ opened: false, existingId: this.raceWinner });
    }
    this.rows.set(notice.id, notice.toPersistence());
    return Promise.resolve({ opened: true });
  }

  load(id: string): Promise<VitrineNotice | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row === undefined ? null : VitrineNotice.rehydrate(row));
  }

  save(notice: VitrineNotice): Promise<void> {
    this.rows.set(notice.id, notice.toPersistence());
    return Promise.resolve();
  }
}

export class StaticReader extends VitrineNoticeReader {
  candidates(): Promise<readonly VitrineNoticeCandidate[]> {
    return Promise.resolve(CANDIDATES);
  }

  constructor(private readonly entries: readonly VitrineNoticeEntry[] = []) {
    super();
  }

  recent(): Promise<readonly VitrineNoticeEntry[]> {
    return Promise.resolve(this.entries);
  }
}
