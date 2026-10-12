import {
  BillingModeDatesHistory,
  type ModeDatesEntry,
} from "../../../domain/entities/billing-mode-dates-history.js";
import {
  PayerBillingModeHistory,
  type NamedPayer,
  type PayerModeEntry,
} from "../../../domain/entities/payer-billing-mode-history.js";
import { BillingModeDatesReader } from "../../../domain/ports/billing-mode-dates.reader.js";
import { BillingModeDatesRepository } from "../../../domain/ports/billing-mode-dates.repository.js";
import { PayerBillingModeRepository } from "../../../domain/ports/payer-billing-mode.repository.js";
import {
  PayerBillingModesReader,
  type PayerModeSegments,
} from "../../../domain/ports/payer-billing-modes.reader.js";
import {
  PayerStandingReader,
  type PayerStanding,
} from "../../../domain/ports/payer-standing.reader.js";
import { ModeDatesTimeline } from "../../../domain/services/mode-dates-timeline.js";
import type { ModeTimelines, PayerModeSegment } from "../../../domain/services/payer-timeline.js";
import type { BillingMode } from "../../../domain/value-objects/billing-mode.js";

/**
 * Doublés du lot M1 — les dates des modes et le mode des payeurs. Chaque port
 * est hérité du port abstrait ; les dépôts et les lecteurs partagent UN magasin,
 * comme la table en base, et `save` n'écrit que ce que l'historique dit neuf
 * ou annulé — la même discipline que l'adaptateur append-only.
 */
export class ModeDatesStore {
  readonly rows: (ModeDatesEntry & {
    readonly legalEntityId: string;
    readonly mode: BillingMode;
  })[] = [];
  saves = 0;
}

export class InMemoryModeDates extends BillingModeDatesRepository {
  constructor(private readonly store: ModeDatesStore) {
    super();
  }

  load(legalEntityId: string, mode: BillingMode): Promise<BillingModeDatesHistory> {
    const entries = this.store.rows.filter(
      (row) => row.legalEntityId === legalEntityId && row.mode === mode,
    );
    return Promise.resolve(BillingModeDatesHistory.reconstitute(legalEntityId, mode, entries));
  }

  save(history: BillingModeDatesHistory): Promise<void> {
    const record = history.toPersistence();
    this.store.saves += 1;
    for (const entry of record.entries) {
      const row = { ...entry, legalEntityId: record.legalEntityId, mode: record.mode };
      if (record.freshIds.includes(entry.id)) {
        this.store.rows.push(row);
      } else if (record.cancelledIds.includes(entry.id)) {
        const index = this.store.rows.findIndex((stored) => stored.id === entry.id);
        this.store.rows[index] = row;
      }
    }
    return Promise.resolve();
  }
}

export class StoreModeDatesReader extends BillingModeDatesReader {
  constructor(private readonly store: ModeDatesStore) {
    super();
  }

  timelinesOf(legalEntityId: string): Promise<ModeTimelines> {
    const timelineOf = (mode: BillingMode): ModeDatesTimeline =>
      ModeDatesTimeline.of(
        mode,
        this.store.rows.filter(
          (row) =>
            row.legalEntityId === legalEntityId && row.mode === mode && row.cancelledAt === null,
        ),
      );
    return Promise.resolve({
      monthly: timelineOf("monthly"),
      semimonthly: timelineOf("semimonthly"),
      weekly: timelineOf("weekly"),
    });
  }
}

export class PayerModesStore {
  readonly rows: (PayerModeEntry & {
    readonly legalEntityId: string;
    readonly payerCompanyId: string;
  })[] = [];
  saves = 0;
}

export class InMemoryPayerModes extends PayerBillingModeRepository {
  constructor(private readonly store: PayerModesStore) {
    super();
  }

  load(legalEntityId: string, payer: NamedPayer): Promise<PayerBillingModeHistory> {
    const entries = this.store.rows.filter(
      (row) => row.legalEntityId === legalEntityId && row.payerCompanyId === payer.id,
    );
    return Promise.resolve(PayerBillingModeHistory.reconstitute(legalEntityId, payer, entries));
  }

  save(history: PayerBillingModeHistory): Promise<void> {
    const record = history.toPersistence();
    this.store.saves += 1;
    for (const entry of record.entries) {
      const row = {
        ...entry,
        legalEntityId: record.legalEntityId,
        payerCompanyId: record.payerCompanyId,
      };
      if (record.freshIds.includes(entry.id)) {
        this.store.rows.push(row);
      } else if (record.cancelledIds.includes(entry.id)) {
        const index = this.store.rows.findIndex((stored) => stored.id === entry.id);
        this.store.rows[index] = row;
      }
    }
    return Promise.resolve();
  }
}

export class StorePayerModesReader extends PayerBillingModesReader {
  constructor(private readonly store: PayerModesStore) {
    super();
  }

  segmentsOf(legalEntityId: string): Promise<readonly PayerModeSegments[]> {
    const payers = new Set(this.live(legalEntityId).map((row) => row.payerCompanyId));
    return Promise.resolve(
      [...payers].map((payerCompanyId) => ({
        payerCompanyId,
        segments: this.segments(legalEntityId, payerCompanyId),
      })),
    );
  }

  segmentsOfPayer(
    legalEntityId: string,
    payerCompanyId: string,
  ): Promise<readonly PayerModeSegment[]> {
    return Promise.resolve(this.segments(legalEntityId, payerCompanyId));
  }

  private live(legalEntityId: string): PayerModesStore["rows"] {
    return this.store.rows.filter(
      (row) => row.legalEntityId === legalEntityId && row.cancelledAt === null,
    );
  }

  private segments(legalEntityId: string, payerCompanyId: string): PayerModeSegment[] {
    return this.live(legalEntityId)
      .filter((row) => row.payerCompanyId === payerCompanyId)
      .map((row) => ({ effectiveFrom: row.effectiveFrom, mode: row.mode }));
  }
}

/** Les comptes connus, et leurs périodes `billing` — sans horloge : ce qu'on lui donne. */
export class FixedStandings extends PayerStandingReader {
  constructor(private readonly standings: readonly PayerStanding[]) {
    super();
  }

  standingOf(companyId: string): Promise<PayerStanding | null> {
    return Promise.resolve(
      this.standings.find((standing) => standing.companyId === companyId) ?? null,
    );
  }
}

/** Un payeur qui règle seul. */
export const PAYER: PayerStanding = { companyId: "cmp_payer", name: "Le Bistrot", follows: [] };
