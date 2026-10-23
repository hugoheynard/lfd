import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import {
  LegalEntityReader,
  type LegalEntityRecord,
} from "../../../domain/ports/legal-entity.reader.js";
import type { PayerStanding } from "../../../domain/ports/payer-standing.reader.js";
import { PayerStandingsReader } from "../../../domain/ports/payer-standings.reader.js";
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

class FixedAccounts extends PayerStandingsReader {
  constructor(private readonly accounts: readonly PayerStanding[]) {
    super();
  }
  allAt(): Promise<readonly PayerStanding[]> {
    return Promise.resolve(this.accounts);
  }
}

function handler(
  payers = new PayerModesStore(),
  accounts: readonly PayerStanding[] = [],
): GetBillingRhythmsCalendarHandler {
  return new GetBillingRhythmsCalendarHandler(
    new OnlyLe1(),
    new StoreModeDatesReader(new ModeDatesStore()),
    new StorePayerModesReader(payers),
    new FixedAccounts(accounts),
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

    const view = await handler(payers).execute(new GetBillingRhythmsCalendarQuery("le1"));

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
      { companyId: "cmp_default", name: "Par Défaut", follows: [] },
      { companyId: "cmp_other", name: "Autre", follows: [] },
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

  it("une entité inconnue : 404 nommé", async () => {
    await expect(
      handler().execute(new GetBillingRhythmsCalendarQuery("nope")),
    ).rejects.toBeInstanceOf(LegalEntityNotFoundError);
  });
});
