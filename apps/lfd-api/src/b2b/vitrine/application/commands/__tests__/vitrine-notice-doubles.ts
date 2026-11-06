import type { MailReceipt } from "@lfd/mailer";

import type { MailDemand } from "../../../../../mail/channels/requests/mail-requests.js";
import {
  OpenableUnitOfWork,
  type RecordedMail,
  RecordingMailRequests,
} from "../../../../../mail/channels/requests/__tests__/recording-mail-requests.js";
import type { B2bMails } from "../../../../../mail/channels/templates/b2b-mails.js";
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

/**
 * La porte du bloc `mail`, doublée pour l'annonce (lot S2h) : `sendNow`
 * seulement — l'unité de travail n'est jamais ouverte, donc un `request`
 * serait refusé. Une adresse de `refused` est refusée par le fournisseur ;
 * `live = false` joue le mailer à blanc (aucun identifiant rendu).
 */
export class RecordingVitrineMails extends RecordingMailRequests {
  readonly refused = new Set<string>();

  constructor(private readonly live = true) {
    super(new OpenableUnitOfWork());
  }

  /** Ce qui est parti sur-le-champ. */
  get sent(): RecordedMail[] {
    return this.sentNow;
  }

  override async sendNow<K extends keyof B2bMails>(demand: MailDemand<K>): Promise<MailReceipt> {
    if (this.refused.has(demand.to)) {
      throw new Error("refus du fournisseur");
    }
    const receipt = await super.sendNow(demand);
    return this.live ? receipt : { providerId: null };
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
