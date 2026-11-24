import {
  BudgetCommitmentAlreadyInvoicedError,
  BudgetCommitmentAlreadyNumberedError,
  BudgetCommitmentInPeriodQuoteError,
  BudgetCommitmentNotInQuoteError,
  BudgetCommitmentNumberRequiredError,
  InvalidBudgetCommitmentError,
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
  timing: "at_order",
};
const FREE: AccountEngagement = { kind: "free" };
const NOT_QUOTED = null;
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

    expect(
      corrected.correct({ number: "1300012345", serviceCode: "" }, ARMY, FREE, NOT_QUOTED),
    ).toBe(true);
    expect(corrected.pendingCommitment).toMatchObject({
      number: "1300012345",
      serviceCode: "SERV-RH",
    });
    expect(corrected.before).toBeNull();
  });

  it("change un numéro faux", () => {
    const corrected = order("1300000000");

    expect(
      corrected.correct({ number: "1300012345", serviceCode: "SERV-RH" }, ARMY, FREE, NOT_QUOTED),
    ).toBe(true);
    expect(corrected.pendingCommitment?.number).toBe("1300012345");
  });

  it("le même engagement n'est pas un geste : rien à écrire", () => {
    const same = order("1300012345");

    expect(
      same.correct({ number: "1300012345", serviceCode: "SERV-RH" }, ARMY, FREE, NOT_QUOTED),
    ).toBe(false);
    expect(same.pendingCommitment).toBeUndefined();
  });

  it("retirer un numéro exigé est refusé, comme à la passation", () => {
    expect(() => order("1300012345").correct(null, ARMY, FREE, NOT_QUOTED)).toThrow(
      BudgetCommitmentNumberRequiredError,
    );
  });
});

describe("OrderBudgetCommitment.correct — après facturation", () => {
  it("refuse une commande facturée, en nommant la facture et l'avoir", () => {
    const invoiced = order("1300000000");

    expect(() =>
      invoiced.correct({ number: "1300012345", serviceCode: "" }, ARMY, INVOICED, NOT_QUOTED),
    ).toThrow(BudgetCommitmentAlreadyInvoicedError);
    expect(() =>
      invoiced.correct({ number: "1300012345", serviceCode: "" }, ARMY, INVOICED, NOT_QUOTED),
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

    expect(() =>
      order().correct({ number: "1", serviceCode: "" }, ARMY, collecting, NOT_QUOTED),
    ).toThrow(/déjà engagée en comptabilité/u);
    expect(() => order().correct({ number: "1", serviceCode: "" }, ARMY, null, NOT_QUOTED)).toThrow(
      BudgetCommitmentAlreadyInvoicedError,
    );
  });
});

const QUOTE = { quoteId: "pq_1", quoteNumber: "D-20261031-1" };
const ON_QUOTE: PayerCommitmentTerms = { ...ARMY, timing: "on_period_quote" };

describe("OrderBudgetCommitment.correct — une commande en devis de période (QD2)", () => {
  it("refuse, en renvoyant au devis, même un code service seul", () => {
    const quoted = order();

    expect(() =>
      quoted.correct({ number: "", serviceCode: "SERV-B" }, ON_QUOTE, FREE, QUOTE),
    ).toThrow(BudgetCommitmentInPeriodQuoteError);
    expect(() =>
      quoted.correct({ number: "", serviceCode: "SERV-B" }, ON_QUOTE, FREE, QUOTE),
    ).toThrow(/dans le devis de période D-20261031-1.*« Engagement reçu »/u);
    expect(quoted.pendingCommitment).toBeUndefined();
  });
});

/** Une commande passée sans numéro, avec le code service de la fiche. */
function quotedOrder(): OrderBudgetCommitment {
  return OrderBudgetCommitment.fromSnapshot({
    orderId: "o_1",
    orderNumber: "ORD-0042",
    placedByUserId: "usr_1",
    payerCompanyId: "co_army",
    commitment: BudgetCommitment.stored(null, "SERV-RH"),
  });
}

describe("OrderBudgetCommitment.acceptQuoted — le numéro reçu sur le devis (QD6)", () => {
  it("écrit le numéro et garde le code service du devis", () => {
    const received = quotedOrder();

    received.acceptQuoted("  1300012345 ", QUOTE, QUOTE);

    expect(received.pendingCommitment).toMatchObject({
      number: "1300012345",
      serviceCode: "SERV-RH",
    });
    expect(received.before).toMatchObject({ number: "", serviceCode: "SERV-RH" });
  });

  it("refuse une commande qui n'est dans aucun devis en attente, ou dans un autre", () => {
    expect(() => quotedOrder().acceptQuoted("1300012345", QUOTE, null)).toThrow(
      BudgetCommitmentNotInQuoteError,
    );
    const other = { quoteId: "pq_2", quoteNumber: "D-20261031-2" };
    expect(() => quotedOrder().acceptQuoted("1300012345", QUOTE, other)).toThrow(
      /n'est plus dans le devis D-20261031-1 en attente/u,
    );
  });

  it("refuse une commande qui porte déjà un numéro", () => {
    expect(() => order("1300000000").acceptQuoted("1300012345", QUOTE, QUOTE)).toThrow(
      BudgetCommitmentAlreadyNumberedError,
    );
  });

  it("refuse un numéro vide ou mal formé, sans rien écrire", () => {
    const received = quotedOrder();

    expect(() => received.acceptQuoted("   ", QUOTE, QUOTE)).toThrow(InvalidBudgetCommitmentError);
    expect(() => received.acceptQuoted("x".repeat(51), QUOTE, QUOTE)).toThrow(
      InvalidBudgetCommitmentError,
    );
    expect(() => received.acceptQuoted("13000\n12345", QUOTE, QUOTE)).toThrow(
      InvalidBudgetCommitmentError,
    );
    expect(received.pendingCommitment).toBeUndefined();
  });

  it("n'obéit pas à la règle de correction : un payeur sur devis reçoit bien son numéro", () => {
    const received = quotedOrder();

    expect(() =>
      received.correct({ number: "1300012345", serviceCode: "" }, ON_QUOTE, FREE, null),
    ).toThrow();
    received.acceptQuoted("1300012345", QUOTE, QUOTE);

    expect(received.pendingCommitment?.number).toBe("1300012345");
  });
});
