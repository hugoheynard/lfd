import { RecipientFingerprint } from "../../../sends/domain/ports/recipient-fingerprint.js";
import {
  type MailRecipientReveal,
  type MailRecipientSearchRecord,
  StaffMailConsultations,
} from "../../../sends/domain/entities/staff-mail-consultations.js";
import type { MarketingPreferenceSnapshot } from "../../domain/entities/marketing-preference-state.js";
import {
  type MarketingPreferenceAdminFilter,
  MarketingPreferenceAdminReader,
} from "../../domain/ports/marketing-preference-admin.reader.js";
import {
  PreferenceConsultationLedger,
  type StoredPreferenceSearch,
} from "../../domain/ports/preference-consultation.ledger.js";
import { PreferenceConsultationsRepository } from "../../domain/ports/preference-consultations.repository.js";
import type { InMemoryPreferences } from "./marketing-doubles.js";

const HOUR = 3_600_000;

/** La lecture du staff, sur le même registre en mémoire : identifiants décroissants. */
export class InMemoryAdminReader extends MarketingPreferenceAdminReader {
  readonly details: string[] = [];

  constructor(private readonly preferences: InMemoryPreferences) {
    super();
  }

  page(
    filter: MarketingPreferenceAdminFilter,
    afterId: string | null,
    limit: number,
  ): Promise<readonly MarketingPreferenceSnapshot[]> {
    const rows = this.all()
      .filter((row) => filter.space === null || row.space === filter.space)
      .filter((row) => filter.status === null || row.status === filter.status)
      .filter((row) => afterId === null || row.id < afterId);
    return Promise.resolve(rows.slice(0, limit));
  }

  byIds(ids: readonly string[]): Promise<readonly MarketingPreferenceSnapshot[]> {
    return Promise.resolve(this.all().filter((row) => ids.includes(row.id)));
  }

  detail(id: string): Promise<MarketingPreferenceSnapshot | null> {
    this.details.push(id);
    return Promise.resolve(this.all().find((row) => row.id === id) ?? null);
  }

  private all(): MarketingPreferenceSnapshot[] {
    return [...this.preferences.rows.values()]
      .map((row) => row.snapshot())
      .sort((a, b) => (a.id < b.id ? 1 : -1));
  }
}

/** Une empreinte de recherche lisible en test, distincte de l'empreinte du registre. */
export class TaggedFingerprint extends RecipientFingerprint {
  of(recipientKey: string): string {
    return `fp:${recipientKey}`;
  }
}

/**
 * Les consultations du registre en mémoire, dépôt et registre de lecture à
 * la fois. `elsewhere` : les consultations du SUIVI de la dernière heure,
 * par personne — le plafond est partagé.
 */
export class InMemoryPreferenceConsultations extends PreferenceConsultationsRepository {
  readonly reveals: MailRecipientReveal[] = [];
  readonly searches: MailRecipientSearchRecord[] = [];
  readonly elsewhere = new Map<string, number>();

  load(staffId: string, now: Date): Promise<StaffMailConsultations> {
    const since = now.getTime() - HOUR;
    const mine = [...this.reveals, ...this.searches].filter(
      (row) => row.staffId === staffId && row.at.getTime() > since,
    );
    const count = mine.length + (this.elsewhere.get(staffId) ?? 0);
    return Promise.resolve(StaffMailConsultations.of(staffId, count, mine[0]?.at ?? null));
  }

  save(consultations: StaffMailConsultations): Promise<void> {
    this.reveals.push(...consultations.newReveals());
    this.searches.push(...consultations.newSearches());
    return Promise.resolve();
  }
}

/** La lecture des consultations rangées par {@link InMemoryPreferenceConsultations}. */
export class InMemoryConsultationLedger extends PreferenceConsultationLedger {
  constructor(private readonly consultations: InMemoryPreferenceConsultations) {
    super();
  }

  lastRevealedAt(staffId: string, preferenceId: string): Promise<Date | null> {
    const mine = this.consultations.reveals.filter(
      (reveal) => reveal.staffId === staffId && reveal.sendId === preferenceId,
    );
    return Promise.resolve(mine.at(-1)?.at ?? null);
  }

  searchOf(searchId: string): Promise<StoredPreferenceSearch | null> {
    const found = this.consultations.searches.find((search) => search.id === searchId);
    return Promise.resolve(
      found === undefined
        ? null
        : { id: found.id, staffId: found.staffId, at: found.at, preferenceIds: found.sendIds },
    );
  }
}
