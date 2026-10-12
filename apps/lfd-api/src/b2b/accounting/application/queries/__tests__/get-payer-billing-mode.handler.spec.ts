import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import { BillingPayerNotFoundError } from "../../../domain/errors/billing-mode-errors.js";
import {
  LegalEntityReader,
  type LegalEntityRecord,
} from "../../../domain/ports/legal-entity.reader.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import { toView } from "../../../infrastructure/legal-entity.mapper.js";
import {
  FixedStandings,
  ModeDatesStore,
  PAYER,
  PayerModesStore,
  StoreModeDatesReader,
  StorePayerModesReader,
} from "../../commands/__tests__/billing-mode-doubles.js";
import { declaredEntity } from "../../commands/__tests__/mandate-setting-doubles.js";
import { GetPayerBillingModeHandler } from "../get-payer-billing-mode.handler.js";
import { GetPayerBillingModeQuery } from "../get-payer-billing-mode.query.js";

class OnlyLe1 extends LegalEntityReader {
  list(): Promise<readonly LegalEntityRecord[]> {
    return Promise.resolve([]);
  }
  byId(id: string): Promise<LegalEntityRecord | null> {
    return Promise.resolve(id === "le1" ? toView(declaredEntity(), true) : null);
  }
}

function handler(payers = new PayerModesStore()): GetPayerBillingModeHandler {
  return new GetPayerBillingModeHandler(
    new OnlyLe1(),
    new FixedStandings([PAYER]),
    new StoreModeDatesReader(new ModeDatesStore()),
    new StorePayerModesReader(payers),
    new FixedClock(paris("2026-10-08", "11:00")),
  );
}

describe("GetPayerBillingModeHandler — le mode d'un payeur (§16.4)", () => {
  it("rien choisi : mensuel par défaut, ses trois prochaines clôtures", async () => {
    const view = await handler().execute(new GetPayerBillingModeQuery("le1", PAYER.companyId));

    expect(view).toMatchObject({
      legalEntityId: "le1",
      payerCompanyId: PAYER.companyId,
      mode: "monthly",
      since: null,
      scheduled: null,
      changeLockedUntil: null,
    });
    expect(view.upcomingClosures.map((closure) => closure.closesAt)).toEqual([
      paris("2026-11-01").toISOString(),
      paris("2026-12-01").toISOString(),
      paris("2027-01-01").toISOString(),
    ]);
  });

  it("un passage programmé à l'hebdomadaire : le programmé, le verrou, et les clôtures qui le suivent", async () => {
    const payers = new PayerModesStore();
    payers.rows.push({
      id: "p1",
      legalEntityId: "le1",
      payerCompanyId: PAYER.companyId,
      effectiveFrom: paris("2026-11-01"),
      mode: "weekly",
      createdAt: paris("2026-10-02"),
      createdByStaffId: "s",
      cancelledAt: null,
      cancelledByStaffId: null,
    });

    const view = await handler(payers).execute(
      new GetPayerBillingModeQuery("le1", PAYER.companyId),
    );

    expect(view.scheduled).toEqual({
      mode: "weekly",
      effectiveAt: paris("2026-11-01").toISOString(),
    });
    expect(view.changeLockedUntil).toBe(paris("2026-11-01").toISOString());
    expect(view.upcomingClosures.map((closure) => closure.periodLabel)).toEqual([
      "du 1er au 31 octobre 2026",
      "du 1er au 1er novembre 2026",
      "du 2 au 8 novembre 2026",
    ]);
  });

  it("refuse une entité ou un compte inconnus", async () => {
    await expect(
      handler().execute(new GetPayerBillingModeQuery("ghost", PAYER.companyId)),
    ).rejects.toThrow(LegalEntityNotFoundError);
    await expect(handler().execute(new GetPayerBillingModeQuery("le1", "ghost"))).rejects.toThrow(
      BillingPayerNotFoundError,
    );
  });
});
