import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import {
  ClosureBatchesReader,
  type ClosureBatchRead,
} from "../../../domain/ports/closure-batches.reader.js";
import {
  LegalEntityReader,
  type LegalEntityRecord,
} from "../../../domain/ports/legal-entity.reader.js";
import type { PayerStanding } from "../../../domain/ports/payer-standing.reader.js";
import type { CollectionMandate } from "../../../domain/ports/collection-mandates.reader.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import { depositDeadlineOf } from "../../../domain/services/collection-calendar.js";
import { toView } from "../../../infrastructure/legal-entity.mapper.js";
import {
  ModeDatesStore,
  PAYER,
  PayerModesStore,
  StoreModeDatesReader,
  StorePayerModesReader,
} from "../../commands/__tests__/billing-mode-doubles.js";
import { declaredEntity } from "../../commands/__tests__/mandate-setting-doubles.js";
import { activePayer, countingOf, signedMandate } from "./counted-payers-doubles.js";
import type { StoredBatchView } from "../../../domain/ports/collection-batch.reader.js";
import { FixedInvoicePeriods } from "../../services/__tests__/issued-invoice-doubles.js";
import { FixedBatches, stored as storedBatch } from "./collection-procedure-doubles.js";
import { GetBillingRhythmsCalendarHandler } from "../get-billing-rhythms-calendar.handler.js";
import { GetBillingRhythmsCalendarQuery } from "../get-billing-rhythms-calendar.query.js";

class OnlyLe1 extends LegalEntityReader {
  constructor(private readonly overrides: Partial<LegalEntityRecord> = {}) {
    super();
  }
  list(): Promise<readonly LegalEntityRecord[]> {
    return Promise.resolve([]);
  }
  byId(id: string): Promise<LegalEntityRecord | null> {
    return Promise.resolve(
      id === "le1" ? { ...toView(declaredEntity(), true), ...this.overrides } : null,
    );
  }
}

/** Les lots donnés, filtrés sur les clôtures demandées. */
class StoredBatches extends ClosureBatchesReader {
  constructor(private readonly reads: readonly ClosureBatchRead[] = []) {
    super();
  }
  ofClosures(
    _legalEntityId: string,
    closures: readonly Date[],
  ): Promise<readonly ClosureBatchRead[]> {
    return Promise.resolve(
      this.reads.filter((read) => closures.some((c) => c.getTime() === read.closesAt.getTime())),
    );
  }
}

function batchAt(
  closesAt: Date,
  batchId: string,
  status: "constituted" | "deposited" | "cancelled",
): ClosureBatchRead {
  return {
    closesAt,
    batch: { batchId, scheme: "CORE", status, periodLabel: "", lineCount: 1, totalCents: 100 },
  };
}

/** Par défaut, chaque compte a son mandat signé actif chez `le1`. */
function handler(
  payers = new PayerModesStore(),
  accounts: readonly PayerStanding[] = [],
  mandates: readonly CollectionMandate[] = accounts.map((a) => signedMandate("le1", a.companyId)),
  extra: {
    readonly entity?: Partial<LegalEntityRecord>;
    readonly batches?: readonly ClosureBatchRead[];
    readonly stored?: readonly StoredBatchView[];
  } = {},
): GetBillingRhythmsCalendarHandler {
  const counting = countingOf(accounts, mandates);
  const stored = new FixedBatches();
  stored.batches = [...(extra.stored ?? [])];
  return new GetBillingRhythmsCalendarHandler(
    new OnlyLe1(extra.entity),
    new StoreModeDatesReader(new ModeDatesStore()),
    new StorePayerModesReader(payers),
    counting.standings,
    counting.mandates,
    counting.lot,
    new StoredBatches(extra.batches),
    stored,
    new FixedInvoicePeriods(new Map()),
    new FixedClock(paris("2026-10-08", "11:00")),
  );
}

describe("GetBillingRhythmsCalendarHandler — les trois rythmes sur un axe", () => {
  it("rend l'axe, aujourd'hui, le délai réglé et les trois rythmes dans l'ordre de l'écran", async () => {
    const view = await handler().execute(new GetBillingRhythmsCalendarQuery("le1"));

    expect(view).toMatchObject({
      legalEntityId: "le1",
      today: "2026-10-08",
      startsOn: "2026-10-05",
      endsOn: "2026-11-16",
      preNotificationDays: toView(declaredEntity(), true).preNotificationDays,
    });
    expect(view.rhythms.map((lane) => lane.mode)).toEqual(["weekly", "semimonthly", "monthly"]);
    for (const lane of view.rhythms) {
      expect(lane.periods.length).toBeGreaterThan(0);
    }
  });

  it("personne n'a choisi : seul le mensuel est suivi", async () => {
    const view = await handler().execute(new GetBillingRhythmsCalendarQuery("le1"));

    expect(view.rhythms.map((lane) => [lane.mode, lane.followed, lane.payerCount])).toEqual([
      ["weekly", false, 0],
      ["semimonthly", false, 0],
      ["monthly", true, 0],
    ]);
  });

  it("un payeur hebdomadaire en vigueur allume l'hebdomadaire ; un choix programmé, pas encore", async () => {
    const payers = new PayerModesStore();
    payers.rows.push({
      id: "p1",
      legalEntityId: "le1",
      payerCompanyId: PAYER.companyId,
      effectiveFrom: paris("2026-10-01"),
      mode: "weekly",
      createdAt: paris("2026-09-20"),
      createdByStaffId: "s",
      cancelledAt: null,
      cancelledByStaffId: null,
    });
    payers.rows.push({
      id: "p2",
      legalEntityId: "le1",
      payerCompanyId: "other-payer",
      effectiveFrom: paris("2026-11-01"),
      mode: "semimonthly",
      createdAt: paris("2026-10-02"),
      createdByStaffId: "s",
      cancelledAt: null,
      cancelledByStaffId: null,
    });

    const view = await handler(payers, [PAYER, activePayer("other-payer")]).execute(
      new GetBillingRhythmsCalendarQuery("le1"),
    );

    expect(view.rhythms.find((lane) => lane.mode === "weekly")).toMatchObject({
      followed: true,
      payerCount: 1,
    });
    expect(view.rhythms.find((lane) => lane.mode === "semimonthly")).toMatchObject({
      followed: false,
      payerCount: 0,
    });
  });

  /**
   * Régression : le mensuel ne comptait que les payeurs ayant une ligne
   * `payer_billing_mode` — jamais ceux qui l'ont par défaut (2026-10-23).
   */
  it("le mensuel ne comptait pas les clients au mode par défaut", async () => {
    const payers = new PayerModesStore();
    payers.rows.push({
      id: "p1",
      legalEntityId: "le1",
      payerCompanyId: PAYER.companyId,
      effectiveFrom: paris("2026-10-01"),
      mode: "weekly",
      createdAt: paris("2026-09-20"),
      createdByStaffId: "s",
      cancelledAt: null,
      cancelledByStaffId: null,
    });
    const site: PayerStanding = {
      companyId: "cmp_site",
      name: "Le Site",
      active: true,
      follows: [
        {
          companyId: "cmp_site",
          payerId: "cmp_default",
          payerName: "Par Défaut",
          validFrom: paris("2026-01-01"),
          validTo: null,
        },
      ],
    };
    const accounts: readonly PayerStanding[] = [
      PAYER,
      activePayer("cmp_default"),
      activePayer("cmp_other"),
      site,
    ];

    const view = await handler(payers, accounts).execute(new GetBillingRhythmsCalendarQuery("le1"));

    // Deux payeurs sans choix au mensuel ; l'hebdomadaire et le site n'y comptent pas.
    expect(view.rhythms.map((lane) => [lane.mode, lane.payerCount])).toEqual([
      ["weekly", 1],
      ["semimonthly", 0],
      ["monthly", 2],
    ]);
  });

  /** Régression : le tableau de bord comptait tout payeur, quel que soit son statut (2026-10-23). */
  it("une société désactivée comptait comme client", async () => {
    const accounts = [activePayer("cmp_on"), activePayer("cmp_off", { active: false })];

    const view = await handler(new PayerModesStore(), accounts).execute(
      new GetBillingRhythmsCalendarQuery("le1"),
    );

    expect(view.rhythms.find((lane) => lane.mode === "monthly")?.payerCount).toBe(1);
  });

  /** Régression : un payeur sans mandat signé actif chez l'entité comptait au mensuel (2026-10-23). */
  it("un client sans mandat signé comptait au mensuel", async () => {
    const accounts = ["cmp_signed", "cmp_none", "cmp_elsewhere"].map((id) => activePayer(id));
    const mandates = [signedMandate("le1", "cmp_signed"), signedMandate("le2", "cmp_elsewhere")];

    const view = await handler(new PayerModesStore(), accounts, mandates).execute(
      new GetBillingRhythmsCalendarQuery("le1"),
    );

    expect(view.rhythms.find((lane) => lane.mode === "monthly")?.payerCount).toBe(1);
  });

  it("un payeur hebdomadaire sans mandat chez l'entité ne compte pas à l'hebdomadaire", async () => {
    const payers = new PayerModesStore();
    payers.rows.push({
      id: "pm_x",
      legalEntityId: "le1",
      payerCompanyId: PAYER.companyId,
      effectiveFrom: paris("2026-10-01"),
      mode: "weekly",
      createdAt: paris("2026-09-20"),
      createdByStaffId: "s",
      cancelledAt: null,
      cancelledByStaffId: null,
    });

    const view = await handler(payers, [PAYER], []).execute(
      new GetBillingRhythmsCalendarQuery("le1"),
    );

    expect(view.rhythms.map((lane) => lane.payerCount)).toEqual([0, 0, 0]);
  });

  it("chaque période sert sa limite de dépôt, calculée par le calendrier du lot", async () => {
    const view = await handler(undefined, undefined, undefined, {
      entity: { depositCutoff: { businessDaysBefore: 2, time: "16:00" } },
    }).execute(new GetBillingRhythmsCalendarQuery("le1"));

    const cutoff = { businessDaysBefore: 2, time: "16:00" };
    const periods = view.rhythms.flatMap((lane) => lane.periods);
    expect(periods.length).toBeGreaterThan(0);
    for (const period of periods) {
      expect(period.depositDeadline).toEqual(depositDeadlineOf(period.collectionDay, cutoff));
      expect((period.depositDeadline?.day ?? "") < period.collectionDay).toBe(true);
    }
  });

  it("limite de dépôt non réglée : `null`, jamais une valeur inventée", async () => {
    const view = await handler(undefined, undefined, undefined, {
      entity: { depositCutoff: null },
    }).execute(new GetBillingRhythmsCalendarQuery("le1"));

    for (const lane of view.rhythms) {
      for (const period of lane.periods) {
        expect(period.depositDeadline).toBeNull();
      }
    }
  });

  it("le lot de la clôture est servi — le vivant avant l'annulé ; aucun lot : `null`", async () => {
    const first = await handler().execute(new GetBillingRhythmsCalendarQuery("le1"));
    const monthly = first.rhythms.find((lane) => lane.mode === "monthly");
    const [withBatch, withoutBatch] = monthly?.periods ?? [];
    if (withBatch === undefined || withoutBatch === undefined) {
      throw new TypeError("le mensuel devrait avoir deux périodes sur l'axe");
    }
    const closesAt = new Date(withBatch.closesAt);

    const view = await handler(undefined, undefined, undefined, {
      batches: [
        batchAt(closesAt, "b_cancelled", "cancelled"),
        batchAt(closesAt, "b_live", "constituted"),
      ],
    }).execute(new GetBillingRhythmsCalendarQuery("le1"));

    const periods = view.rhythms.find((lane) => lane.mode === "monthly")?.periods ?? [];
    expect(periods.find((p) => p.closesAt === withBatch.closesAt)?.batchId).toBe("b_live");
    expect(periods.find((p) => p.closesAt === withoutBatch.closesAt)?.batchId).toBeNull();
  });

  it("chaque période porte le code de sa procédure ; le 1er réunit deux rythmes qui ont des clients (mutualisée)", async () => {
    const view = await handler(semimonthlyPayer(), [PAYER, activePayer("monthly-client")]).execute(
      new GetBillingRhythmsCalendarQuery("le1"),
    );

    const semimonthly = view.rhythms.find((lane) => lane.mode === "semimonthly");
    const monthly = view.rhythms.find((lane) => lane.mode === "monthly");
    expect(semimonthly?.periods.find((p) => p.closesAt === FIRST)).toMatchObject({
      procedureCode: "PRL-261101-BM",
      closureModes: ["monthly", "semimonthly"],
    });
    expect(monthly?.periods.find((p) => p.closesAt === FIRST)?.procedureCode).toBe("PRL-261101-BM");
    expect(semimonthly?.periods.find((p) => p.closesAt === SIXTEENTH)).toMatchObject({
      procedureCode: "PRL-261016-B",
      closureModes: ["semimonthly"],
    });
  });

  /**
   * Hugo, 2026-10-23 : le 1er était « BM / mutualisée » parce que le
   * calendrier y clôt le mensuel, même sans aucun client mensuel.
   */
  it("le 1er sans client mensuel : le code ne porte que le rythme qui a des clients, pas mutualisé", async () => {
    const view = await handler(semimonthlyPayer(), [PAYER]).execute(
      new GetBillingRhythmsCalendarQuery("le1"),
    );

    const monthly = view.rhythms.find((lane) => lane.mode === "monthly");
    expect(monthly?.periods.find((p) => p.closesAt === FIRST)).toMatchObject({
      procedureCode: "PRL-261101-B",
      closureModes: ["semimonthly"],
    });
  });

  it("aucun client : le code n'a pas de lettre", async () => {
    const view = await handler().execute(new GetBillingRhythmsCalendarQuery("le1"));

    const monthly = view.rhythms.find((lane) => lane.mode === "monthly");
    expect(monthly?.periods.find((p) => p.closesAt === FIRST)).toMatchObject({
      procedureCode: "PRL-261101",
      closureModes: [],
    });
  });

  it("un lot existe : ses clients font les rythmes, pas le compte d'aujourd'hui", async () => {
    const view = await handler(
      semimonthlyPayer(),
      [PAYER, activePayer("monthly-client")],
      undefined,
      {
        stored: [
          storedBatch("b1", {
            cycleClosesAt: FIRST,
            payerRefs: [{ payerCompanyId: "monthly-client", invoiceId: null }],
          }),
        ],
      },
    ).execute(new GetBillingRhythmsCalendarQuery("le1"));

    const monthly = view.rhythms.find((lane) => lane.mode === "monthly");
    expect(monthly?.periods.find((p) => p.closesAt === FIRST)).toMatchObject({
      procedureCode: "PRL-261101-M",
      closureModes: ["monthly"],
    });
  });

  it("une entité inconnue : 404 nommé", async () => {
    await expect(
      handler().execute(new GetBillingRhythmsCalendarQuery("nope")),
    ).rejects.toBeInstanceOf(LegalEntityNotFoundError);
  });
});

const FIRST = paris("2026-11-01").toISOString();
const SIXTEENTH = paris("2026-10-16").toISOString();

/** `PAYER` en « deux fois par mois » depuis le 1er octobre. */
function semimonthlyPayer(): PayerModesStore {
  const payers = new PayerModesStore();
  payers.rows.push({
    id: "p1",
    legalEntityId: "le1",
    payerCompanyId: PAYER.companyId,
    effectiveFrom: paris("2026-10-01"),
    mode: "semimonthly",
    createdAt: paris("2026-09-20"),
    createdByStaffId: "s",
    cancelledAt: null,
    cancelledByStaffId: null,
  });
  return payers;
}
