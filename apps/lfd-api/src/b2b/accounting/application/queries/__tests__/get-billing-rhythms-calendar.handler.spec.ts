import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import {
  LegalEntityReader,
  type LegalEntityRecord,
} from "../../../domain/ports/legal-entity.reader.js";
import type { PayerStanding } from "../../../domain/ports/payer-standing.reader.js";
import type { CollectionMandate } from "../../../domain/ports/collection-mandates.reader.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
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
import { GetBillingRhythmsCalendarHandler } from "../get-billing-rhythms-calendar.handler.js";
import { GetBillingRhythmsCalendarQuery } from "../get-billing-rhythms-calendar.query.js";

class OnlyLe1 extends LegalEntityReader {
  list(): Promise<readonly LegalEntityRecord[]> {
    return Promise.resolve([]);
  }
  byId(id: string): Promise<LegalEntityRecord | null> {
    return Promise.resolve(id === "le1" ? toView(declaredEntity(), true) : null);
  }
}

/** Par défaut, chaque compte a son mandat signé actif chez `le1`. */
function handler(
  payers = new PayerModesStore(),
  accounts: readonly PayerStanding[] = [],
  mandates: readonly CollectionMandate[] = accounts.map((a) => signedMandate("le1", a.companyId)),
): GetBillingRhythmsCalendarHandler {
  const counting = countingOf(accounts, mandates);
  return new GetBillingRhythmsCalendarHandler(
    new OnlyLe1(),
    new StoreModeDatesReader(new ModeDatesStore()),
    new StorePayerModesReader(payers),
    counting.standings,
    counting.mandates,
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

  it("une entité inconnue : 404 nommé", async () => {
    await expect(
      handler().execute(new GetBillingRhythmsCalendarQuery("nope")),
    ).rejects.toBeInstanceOf(LegalEntityNotFoundError);
  });
});
