import { PeriodQuote, periodQuoteNumberOf } from "../period-quote.js";
import {
  EmptyPeriodQuoteError,
  InvalidPeriodQuoteRankError,
  PeriodQuoteCommitmentClosedError,
  PeriodQuoteCommitmentOutdatedError,
  PeriodQuoteNotAwaitingError,
} from "../../errors/period-quote-errors.js";
import type { InvoiceableOrder } from "../../services/monthly-invoicing.js";
import { periodQuoteFigures } from "../../services/period-quote-fingerprint.js";
import { frozenOrder } from "../../services/__tests__/collection-fixtures.js";

/** Le devis de période à sa naissance (QD3, QD5). Les dates sont des données. */

/** Le 1er octobre 2026 à 00h00, heure de Paris : la clôture de septembre. */
const CLOSES_AT = new Date("2026-09-30T22:00:00.000Z");
const STARTS_AT = new Date("2026-08-31T22:00:00.000Z");
const PLACED_AT = new Date("2026-09-15T08:00:00.000Z");

function order(id: string): InvoiceableOrder {
  return {
    orderId: id,
    orderNumber: `ORD-${id}`,
    companyId: "c_army",
    placedAt: PLACED_AT,
    receivedOn: "2026-09-16",
    billedCompanyId: null,
    frozen: frozenOrder(`ORD-${id}`, PLACED_AT),
    deliveryNoteNumbers: [],
    budgetCommitment: null,
  };
}

function shelve(orders: readonly InvoiceableOrder[], rank = 3): PeriodQuote {
  return PeriodQuote.shelve({
    id: "q_1",
    rank,
    legalEntityId: "le_1",
    payerCompanyId: "c_army",
    payerName: "Caserne des Alpes",
    mandateId: null,
    serviceCode: "SERV-RH",
    periodStartsAt: STARTS_AT,
    periodClosesAt: CLOSES_AT,
    orders,
    createdAt: CLOSES_AT,
  });
}

describe("PeriodQuote.shelve", () => {
  it("naît en version 1, en attente, numérotée sur le dernier jour de la période", () => {
    const quote = shelve([order("a"), order("b")]).toSnapshot();

    expect(quote).toMatchObject({
      number: "D-20260930-3",
      version: 1,
      state: "awaiting",
      orderIds: ["a", "b"],
    });
  });

  it("porte l'empreinte et le total calculés sur SES commandes", () => {
    const orders = [order("a"), order("b")];

    expect(shelve(orders).toSnapshot()).toMatchObject(periodQuoteFigures(orders));
  });

  it("refuse un devis sans commande", () => {
    expect(() => shelve([])).toThrow(EmptyPeriodQuoteError);
  });

  it("refuse un rang qui n'est pas un entier positif", () => {
    expect(() => shelve([order("a")], 0)).toThrow(InvalidPeriodQuoteRankError);
    expect(() => shelve([order("a")], 1.5)).toThrow(InvalidPeriodQuoteRankError);
  });
});

describe("PeriodQuote.keeping", () => {
  it("recalcule empreinte et total sur les commandes que la base a prises (v5 S4)", () => {
    const quote = shelve([order("a"), order("b")]);

    const kept = quote.keeping(new Set(["b"])).toSnapshot();

    expect(kept).toMatchObject({ ...periodQuoteFigures([order("b")]), orderIds: ["b"] });
    expect(kept.number).toBe(quote.number);
  });

  it("refuse de n'en garder aucune", () => {
    expect(() => shelve([order("a")]).keeping(new Set())).toThrow(EmptyPeriodQuoteError);
  });
});

describe("periodQuoteNumberOf", () => {
  it("D-<AAAAMMJJ>-<rang>, le jour étant la veille de la clôture à Paris", () => {
    expect(periodQuoteNumberOf(CLOSES_AT, 12)).toBe("D-20260930-12");
  });
});

describe("PeriodQuote.resend (QD5)", () => {
  const AT = new Date("2026-10-05T09:00:00.000Z");

  it("même empreinte : la même version repart, rien ne change", () => {
    const quote = shelve([order("a"), order("b")]);

    const outcome = quote.resend([order("b"), order("a")], "q_2", AT);

    expect(outcome).toEqual({ kind: "unchanged", quote });
  });

  it("empreinte différente : une version n+1 sous le même numéro, l'ancienne remplacée", () => {
    const quote = PeriodQuote.restore(shelve([order("a"), order("b")]).toSnapshot());

    const outcome = quote.resend([order("a")], "q_2", AT);

    expect(outcome.kind).toBe("renewed");
    if (outcome.kind !== "renewed") {
      return;
    }
    expect(outcome.superseded.toSnapshot()).toMatchObject({
      id: "q_1",
      version: 1,
      state: "superseded",
    });
    expect(outcome.successor.toSnapshot()).toMatchObject({
      id: "q_2",
      number: "D-20260930-3",
      version: 2,
      state: "awaiting",
      orderIds: ["a"],
      createdAt: AT,
      ...periodQuoteFigures([order("a")]),
    });
  });

  it.each(["invoiced", "superseded"] as const)("refuse un devis %s, en le nommant", (state) => {
    const quote = PeriodQuote.restore({ ...shelve([order("a")]).toSnapshot(), state });

    expect(() => quote.resend([order("a")], "q_2", AT)).toThrow(PeriodQuoteNotAwaitingError);
    expect(() => quote.resend([order("a")], "q_2", AT)).toThrow(/D-20260930-3 \(version 1\)/u);
  });

  it("refuse un devis dont plus aucune commande n'est à facturer", () => {
    const quote = shelve([order("a")]);

    expect(() => quote.resend([], "q_2", AT)).toThrow(EmptyPeriodQuoteError);
  });
});

describe("PeriodQuote.acceptCommitment et invoiced — « Engagement reçu » (QD6)", () => {
  it("accepte les mêmes commandes, dans n'importe quel ordre, et passe facturé avec sa facture", () => {
    const quote = shelve([order("a"), order("b")]);

    expect(() => quote.acceptCommitment([order("b"), order("a")])).not.toThrow();
    const invoiced = quote.invoiced("inv_1").toSnapshot();

    expect(invoiced).toMatchObject({ state: "invoiced", invoiceId: "inv_1", version: 1 });
    expect(quote.toSnapshot()).toMatchObject({ state: "awaiting", invoiceId: null });
  });

  it("refuse une empreinte changée, ou plus aucune commande, en nommant le renvoi", () => {
    const quote = shelve([order("a"), order("b")]);

    expect(() => quote.acceptCommitment([order("a")])).toThrow(PeriodQuoteCommitmentOutdatedError);
    expect(() => quote.acceptCommitment([])).toThrow(
      /n'est plus à jour : renvoyez-le avant d'enregistrer l'engagement/u,
    );
  });

  it("refuse un devis facturé ou remplacé", () => {
    const quote = shelve([order("a")]);
    const invoiced = quote.invoiced("inv_1");
    const resent = quote.resend([order("a"), order("b")], "q_2", CLOSES_AT);
    if (resent.kind !== "renewed") {
      throw new TypeError("une commande de plus fait une nouvelle version");
    }

    expect(() => invoiced.acceptCommitment([order("a")])).toThrow(PeriodQuoteCommitmentClosedError);
    expect(() => invoiced.invoiced("inv_2")).toThrow(/est déjà facturé/u);
    expect(() => resent.superseded.acceptCommitment([order("a")])).toThrow(
      /remplacé par une version plus récente/u,
    );
  });
});
