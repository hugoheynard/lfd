import {
  BudgetCommitmentAlreadyInvoicedError,
  BudgetCommitmentNumberRequiredError,
} from "../../errors/budget-commitment-errors.js";
import type { AccountEngagement } from "../../ports/account-order-engagement.js";
import type { PayerCommitmentTerms } from "../../services/budget-commitment-rule.js";
import { BudgetCommitment } from "../../value-objects/budget-commitment.js";
import { OrderBudgetCommitment } from "../order-budget-commitment.js";

/** La correction de l'engagement, avant et après facturation (E3′). */

const ARMY: PayerCommitmentTerms = {
  kind: "public",
  commitmentRequired: true,
  serviceCodeRequired: false,
  defaultServiceCode: "SERV-RH",
};
const FREE: AccountEngagement = { kind: "free" };
const INVOICED: AccountEngagement = {
  kind: "invoiced",
  invoiceNumber: "FA-LFD-2026-000012",
  issuedOn: "2026-10-31",
};

function order(number: string | null = null): OrderBudgetCommitment {
  return OrderBudgetCommitment.fromSnapshot({
    orderId: "o_1",
    orderNumber: "ORD-0042",
    placedByUserId: "usr_1",
    payerCompanyId: "co_army",
    commitment: BudgetCommitment.stored(number, number === null ? null : "SERV-RH"),
  });
}

describe("OrderBudgetCommitment.correct — avant facturation", () => {
  it("pose le numéro manquant découvert après la livraison", () => {
    const corrected = order();

    expect(corrected.correct({ number: "1300012345", serviceCode: "" }, ARMY, FREE)).toBe(true);
    expect(corrected.pendingCommitment).toMatchObject({
      number: "1300012345",
      serviceCode: "SERV-RH",
    });
    expect(corrected.before).toBeNull();
  });

  it("change un numéro faux", () => {
    const corrected = order("1300000000");

    expect(corrected.correct({ number: "1300012345", serviceCode: "SERV-RH" }, ARMY, FREE)).toBe(
      true,
    );
    expect(corrected.pendingCommitment?.number).toBe("1300012345");
  });

  it("le même engagement n'est pas un geste : rien à écrire", () => {
    const same = order("1300012345");

    expect(same.correct({ number: "1300012345", serviceCode: "SERV-RH" }, ARMY, FREE)).toBe(false);
    expect(same.pendingCommitment).toBeUndefined();
  });

  it("retirer un numéro exigé est refusé, comme à la passation", () => {
    expect(() => order("1300012345").correct(null, ARMY, FREE)).toThrow(
      BudgetCommitmentNumberRequiredError,
    );
  });
});

describe("OrderBudgetCommitment.correct — après facturation", () => {
  it("refuse une commande facturée, en nommant la facture et l'avoir", () => {
    const invoiced = order("1300000000");

    expect(() =>
      invoiced.correct({ number: "1300012345", serviceCode: "" }, ARMY, INVOICED),
    ).toThrow(BudgetCommitmentAlreadyInvoicedError);
    expect(() =>
      invoiced.correct({ number: "1300012345", serviceCode: "" }, ARMY, INVOICED),
    ).toThrow(/déjà facturée \(FA-LFD-2026-000012\).*Voyez avec la comptabilité/u);
    expect(invoiced.pendingCommitment).toBeUndefined();
  });

  it("refuse une commande engagée autrement, ou dont l'engagement est inconnu", () => {
    const collecting: AccountEngagement = {
      kind: "collecting",
      state: "batched",
      collectionDay: null,
      statementNumber: null,
    };

    expect(() => order().correct({ number: "1", serviceCode: "" }, ARMY, collecting)).toThrow(
      /déjà engagée en comptabilité/u,
    );
    expect(() => order().correct({ number: "1", serviceCode: "" }, ARMY, null)).toThrow(
      BudgetCommitmentAlreadyInvoicedError,
    );
  });
});
