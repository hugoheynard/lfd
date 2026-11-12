import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { BillingPayerNotFoundError } from "../../../domain/errors/billing-mode-errors.js";
import {
  LegalEntityReader,
  type LegalEntityRecord,
} from "../../../domain/ports/legal-entity.reader.js";
import type { PayerStanding } from "../../../domain/ports/payer-standing.reader.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import { toView } from "../../../infrastructure/legal-entity.mapper.js";
import {
  FixedStandings,
  PAYER,
  PayerModesStore,
  StorePayerModesReader,
} from "../../commands/__tests__/billing-mode-doubles.js";
import { declaredEntity } from "../../commands/__tests__/mandate-setting-doubles.js";
import { GetInitialPayerBillingModeHandler } from "../get-initial-payer-billing-mode.handler.js";
import { GetInitialPayerBillingModeQuery } from "../get-initial-payer-billing-mode.query.js";

const NOW = paris("2026-10-08", "11:00");

function record(id: string, name: string, archivedAt: string | null = null): LegalEntityRecord {
  return { ...toView(declaredEntity(), true), id, name, archivedAt };
}

class ListedEntities extends LegalEntityReader {
  constructor(private readonly records: readonly LegalEntityRecord[]) {
    super();
  }
  list(): Promise<readonly LegalEntityRecord[]> {
    return Promise.resolve(this.records);
  }
  byId(id: string): Promise<LegalEntityRecord | null> {
    return Promise.resolve(this.records.find((entity) => entity.id === id) ?? null);
  }
}

const SITE: PayerStanding = {
  companyId: "cmp_site",
  name: "Le Site",
  active: true,
  follows: [
    {
      companyId: "cmp_site",
      payerId: PAYER.companyId,
      payerName: PAYER.name,
      validFrom: paris("2026-01-01"),
      validTo: null,
    },
  ],
};

function handler(
  entities: readonly LegalEntityRecord[],
  payers = new PayerModesStore(),
): GetInitialPayerBillingModeHandler {
  return new GetInitialPayerBillingModeHandler(
    new ListedEntities(entities),
    new FixedStandings([PAYER, SITE]),
    new StorePayerModesReader(payers),
    new FixedClock(NOW),
  );
}

function segment(
  legalEntityId: string,
  mode: "monthly" | "semimonthly" | "weekly",
  createdAt: Date,
  cancelledAt: Date | null = null,
): PayerModesStore["rows"][number] {
  return {
    id: `${legalEntityId}-${mode}-${createdAt.getTime()}`,
    legalEntityId,
    payerCompanyId: PAYER.companyId,
    effectiveFrom: paris("2026-11-01"),
    mode,
    createdAt,
    createdByStaffId: "s",
    cancelledAt,
    cancelledByStaffId: cancelledAt === null ? null : "s",
  };
}

describe("GetInitialPayerBillingModeHandler — le premier choix, vu de la fiche", () => {
  it("rien choisi : les entités en service dans l'ordre de la liste, sans les archivées", async () => {
    const view = await handler([
      record("le1", "La Folie Douce"),
      record("le0", "Ancienne", paris("2026-01-01").toISOString()),
      record("le2", "La Folie Coffee"),
    ]).execute(new GetInitialPayerBillingModeQuery(PAYER.companyId));

    expect(view).toEqual({
      entities: [
        { id: "le1", name: "La Folie Douce" },
        { id: "le2", name: "La Folie Coffee" },
      ],
      chosen: [],
      requiresChoice: true,
    });
  });

  it("le mode choisi par entité est le dernier segment vivant écrit, annulés ignorés", async () => {
    const payers = new PayerModesStore();
    payers.rows.push(
      segment("le1", "weekly", paris("2026-10-01")),
      segment("le1", "semimonthly", paris("2026-10-05")),
      segment("le2", "weekly", paris("2026-10-02"), paris("2026-10-03")),
    );

    const view = await handler(
      [record("le1", "La Folie Douce"), record("le2", "La Folie Coffee")],
      payers,
    ).execute(new GetInitialPayerBillingModeQuery(PAYER.companyId));

    expect(view.chosen).toEqual([{ legalEntityId: "le1", mode: "semimonthly" }]);
  });

  it("un site facturé chez son principal n'a pas de mode à choisir", async () => {
    const view = await handler([record("le1", "La Folie Douce")]).execute(
      new GetInitialPayerBillingModeQuery(SITE.companyId),
    );

    expect(view.requiresChoice).toBe(false);
  });

  it("refuse un compte inconnu", async () => {
    await expect(
      handler([]).execute(new GetInitialPayerBillingModeQuery("cmp_inconnu")),
    ).rejects.toBeInstanceOf(BillingPayerNotFoundError);
  });
});
