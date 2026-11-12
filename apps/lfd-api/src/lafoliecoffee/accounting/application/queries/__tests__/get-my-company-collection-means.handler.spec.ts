import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { SELLER_FACTS } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import { SeveralClientCollectionMeansError } from "../../../domain/errors/collection-means-errors.js";
import { InvoiceCompanyNotFoundError } from "../../../domain/errors/invoice-access-errors.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import { FixedStandings, PAYER } from "../../commands/__tests__/billing-mode-doubles.js";
import {
  meansRow,
  PayerMeansStore,
  StorePayerMeansReader,
} from "../../commands/__tests__/collection-means-doubles.js";
import { FixedIssuers } from "../../commands/__tests__/monthly-invoice-doubles.js";
import { FixedRoles } from "../../services/__tests__/issued-invoice-doubles.js";
import { GetMyCompanyCollectionMeansHandler } from "../get-my-company-collection-means.handler.js";
import { GetMyCompanyCollectionMeansQuery } from "../get-my-company-collection-means.query.js";

// Horloge fixe : les segments sont datés avant elle, et comparés à elle.
const NOW = paris("2026-10-08", "11:00");
const LE = SELLER_FACTS.legalEntityId;

const SITE = {
  companyId: "cmp_site",
  name: "Site Annexe",
  active: true,
  follows: [
    {
      companyId: "cmp_site",
      payerId: PAYER.companyId,
      payerName: PAYER.name,
      validFrom: paris("2026-09-01"),
      validTo: null,
    },
  ],
};

function handler(means: PayerMeansStore, issuers = [SELLER_FACTS]) {
  return new GetMyCompanyCollectionMeansHandler(
    new FixedRoles(
      new Map([
        ["u_payer:cmp_payer", "orders"],
        ["u_site:cmp_site", "billing"],
      ] as const),
    ),
    new FixedIssuers(issuers),
    new FixedStandings([PAYER, SITE]),
    new StorePayerMeansReader(means),
    new FixedClock(NOW),
  );
}

function transferPayer(): PayerMeansStore {
  const store = new PayerMeansStore();
  store.rows.push(meansRow(PAYER.companyId, "bank_transfer", paris("2026-10-01"), LE));
  return store;
}

describe("GetMyCompanyCollectionMeansHandler — le moyen côté client (T5)", () => {
  it("un membre lit le virement de son payeur, quel que soit son rôle", async () => {
    const view = await handler(transferPayer()).execute(
      new GetMyCompanyCollectionMeansQuery("u_payer", PAYER.companyId),
    );

    expect(view).toEqual({ means: "bank_transfer" });
  });

  it("un site qui suit son principal lit le moyen du principal", async () => {
    const view = await handler(transferPayer()).execute(
      new GetMyCompanyCollectionMeansQuery("u_site", "cmp_site"),
    );

    expect(view.means).toBe("bank_transfer");
  });

  it("un payeur qui n'a rien changé règle par prélèvement ; un virement programmé ne compte pas encore", async () => {
    const store = new PayerMeansStore();
    store.rows.push(meansRow(PAYER.companyId, "bank_transfer", paris("2026-11-01"), LE));

    const view = await handler(store).execute(
      new GetMyCompanyCollectionMeansQuery("u_payer", PAYER.companyId),
    );

    expect(view.means).toBe("sepa_debit");
  });

  it("un non-membre reçoit le 404 non divulguant, même sur une société qui existe", async () => {
    await expect(
      handler(transferPayer()).execute(
        new GetMyCompanyCollectionMeansQuery("u_site", PAYER.companyId),
      ),
    ).rejects.toBeInstanceOf(InvoiceCompanyNotFoundError);
  });

  it("deux entités en service qui divergent : refus plutôt qu'un choix", async () => {
    const other = { ...SELLER_FACTS, legalEntityId: "le_other" };

    await expect(
      handler(transferPayer(), [SELLER_FACTS, other]).execute(
        new GetMyCompanyCollectionMeansQuery("u_payer", PAYER.companyId),
      ),
    ).rejects.toBeInstanceOf(SeveralClientCollectionMeansError);
  });
});
