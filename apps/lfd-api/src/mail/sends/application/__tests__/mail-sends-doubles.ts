import {
  StaffMailConsultations,
  type MailRecipientReveal,
  type MailRecipientSearchRecord,
} from "../../domain/entities/staff-mail-consultations.js";
import { MailSearchLedger, type StoredMailSearch } from "../../domain/ports/mail-search.ledger.js";
import { MailSendFinder } from "../../domain/ports/mail-send-finder.js";
import { RecipientFingerprint } from "../../domain/ports/recipient-fingerprint.js";
import { MailProbeTemplates } from "../../domain/ports/mail-probe-templates.js";
import {
  MailRecipientReader,
  type RevealedMailRecipient,
} from "../../domain/ports/mail-recipient.reader.js";
import { MailRevealLedger } from "../../domain/ports/mail-reveal.ledger.js";
import { MailSendSubjects, type MailSendSubject } from "../../domain/ports/mail-send-subjects.js";
import {
  type MailSendFilter,
  type MailSendPosition,
  MailSendReader,
  type MailSendRecord,
} from "../../domain/ports/mail-send.reader.js";
import { StaffMailConsultationsRepository } from "../../domain/ports/staff-mail-consultations.repository.js";

/** Une demande du suivi, telle que le lecteur la rend. */
export function record(overrides: Partial<MailSendRecord> = {}): MailSendRecord {
  return {
    id: "send_1",
    template: "customer.order-ready",
    space: "lfc",
    recipient: "colette@halles.fr",
    locale: "fr",
    status: "sent",
    providerId: "re_1",
    requestedAt: new Date(Date.UTC(2026, 0, 1, 8)),
    sentAt: new Date(Date.UTC(2026, 0, 1, 8, 1)),
    failedAt: null,
    firstAttemptAt: new Date(Date.UTC(2026, 0, 1, 8, 0, 30)),
    lastAttemptAt: new Date(Date.UTC(2026, 0, 1, 8, 0, 30)),
    attempts: 1,
    documentVersion: 3,
    delivery: null,
    deliveryAt: null,
    deliveryKind: null,
    subjects: [],
    ...overrides,
  };
}

/** Le lecteur : rend les lignes qu'on lui donne, et garde ce qu'on lui a demandé. */
export class FixedMailSendReader extends MailSendReader {
  readonly calls: { filter: MailSendFilter; after: MailSendPosition | null; limit: number }[] = [];

  constructor(private readonly rows: readonly MailSendRecord[]) {
    super();
  }

  page(
    filter: MailSendFilter,
    after: MailSendPosition | null,
    limit: number,
  ): Promise<readonly MailSendRecord[]> {
    this.calls.push({ filter, after, limit });
    return Promise.resolve(this.rows.slice(0, limit));
  }

  byIds(ids: readonly string[]): Promise<readonly MailSendRecord[]> {
    return Promise.resolve(this.rows.filter((row) => ids.includes(row.id)));
  }

  detail(id: string): Promise<MailSendRecord | null> {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }
}

export class FixedProbeTemplates extends MailProbeTemplates {
  constructor(private readonly probes: readonly string[]) {
    super();
  }

  keys(): readonly string[] {
    return this.probes;
  }
}

export class FixedSendSubjects extends MailSendSubjects {
  constructor(private readonly subjects: ReadonlyMap<string, MailSendSubject>) {
    super();
  }

  subjectOf(sendId: string): Promise<MailSendSubject | null> {
    return Promise.resolve(this.subjects.get(sendId) ?? null);
  }
}

/** Le dépôt et le registre des révélations, sur une même liste en mémoire. */
export class InMemoryConsultations extends StaffMailConsultationsRepository {
  readonly reveals: MailRecipientReveal[] = [];
  readonly savedSearches: MailRecipientSearchRecord[] = [];
  /** Les recherches de la fenêtre, par personne : elles comptent dans le plafond. */
  readonly searches = new Map<string, number>();

  load(staffId: string, now: Date): Promise<StaffMailConsultations> {
    const since = now.getTime() - 3_600_000;
    const recent = this.reveals.filter(
      (reveal) => reveal.staffId === staffId && reveal.at.getTime() > since,
    );
    const mine = this.savedSearches.filter(
      (search) => search.staffId === staffId && search.at.getTime() > since,
    );
    const count = recent.length + mine.length + (this.searches.get(staffId) ?? 0);
    return Promise.resolve(StaffMailConsultations.of(staffId, count, recent[0]?.at ?? null));
  }

  save(consultations: StaffMailConsultations): Promise<void> {
    this.reveals.push(...consultations.newReveals());
    this.savedSearches.push(...consultations.newSearches());
    return Promise.resolve();
  }
}

export class InMemoryRevealLedger extends MailRevealLedger {
  constructor(private readonly consultations: InMemoryConsultations) {
    super();
  }

  lastRevealedAt(staffId: string, sendId: string): Promise<Date | null> {
    const mine = this.consultations.reveals.filter(
      (reveal) => reveal.staffId === staffId && reveal.sendId === sendId,
    );
    return Promise.resolve(mine.at(-1)?.at ?? null);
  }
}

export class FixedRecipientReader extends MailRecipientReader {
  readonly reads: string[] = [];

  constructor(private readonly recipients: ReadonlyMap<string, RevealedMailRecipient>) {
    super();
  }

  recipientOf(sendId: string): Promise<RevealedMailRecipient | null> {
    this.reads.push(sendId);
    return Promise.resolve(this.recipients.get(sendId) ?? null);
  }
}

/** Les envois par clé d'adresse. */
export class FixedSendFinder extends MailSendFinder {
  readonly keys: string[] = [];

  constructor(private readonly byKey: ReadonlyMap<string, readonly string[]>) {
    super();
  }

  idsByRecipientKey(recipientKey: string): Promise<readonly string[]> {
    this.keys.push(recipientKey);
    return Promise.resolve(this.byKey.get(recipientKey) ?? []);
  }
}

/** Une empreinte lisible en test : jamais l'adresse elle-même. */
export class PrefixFingerprint extends RecipientFingerprint {
  of(recipientKey: string): string {
    return `fp(${String(recipientKey.length)})`;
  }
}

/** Les recherches rangées par {@link InMemoryConsultations}. */
export class InMemorySearchLedger extends MailSearchLedger {
  constructor(private readonly consultations: InMemoryConsultations) {
    super();
  }

  searchOf(searchId: string): Promise<StoredMailSearch | null> {
    const found = this.consultations.savedSearches.find((search) => search.id === searchId);
    return Promise.resolve(
      found === undefined
        ? null
        : { id: found.id, staffId: found.staffId, at: found.at, sendIds: found.sendIds },
    );
  }
}
