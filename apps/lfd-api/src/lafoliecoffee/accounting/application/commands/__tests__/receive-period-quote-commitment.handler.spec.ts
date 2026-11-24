import { DomainError } from "../../../../../platform/shared/errors/app-error.js";

/** Le refus que la commande lève sur un numéro mal formé (`InvalidBudgetCommitmentError`). */
class MalformedNumberError extends DomainError {
  constructor() {
    super("budget_commitment.invalid", "numéro mal formé");
  }
}
import {
  PeriodQuoteCommitmentClosedError,
  PeriodQuoteCommitmentGroupsError,
  PeriodQuoteCommitmentOutdatedError,
  PeriodQuoteNotFoundError,
} from "../../../domain/errors/period-quote-errors.js";
import { InvoiceIssuanceBlockedError } from "../../../domain/errors/invoice-errors.js";
import { INVOICE_ISSUED } from "../../../domain/events/invoice-issued.fact.js";
import { PERIOD_QUOTE_COMMITMENT_RECEIVED } from "../../../domain/events/period-quote.events.js";
import { armyOrder } from "../../services/__tests__/period-quote-document-doubles.js";
import { ReceivePeriodQuoteCommitmentCommand } from "../receive-period-quote-commitment.command.js";
import { commitmentWorld, SERVICE_CODE } from "./period-quote-commitment-doubles.js";

/**
 * « Engagement reçu » (QD6, v5 B1, B2, S2) — l'orchestration, ports doublés
 * à la main : le verrou d'abord, l'empreinte revérifiée, le numéro écrit par
 * la commande, les commandes RELUES et regroupées en une facture, la facture
 * émise, le devis facturé, le journal et le sceau dans la même transaction.
 * Les doublés ne jouent pas l'annulation : un refus se prouve ici par ce qui
 * n'a PAS été appelé, et l'annulation par l'e2e.
 */

const NUMBER = "1300012345";

function receive(w: ReturnType<typeof commitmentWorld>, intent = "intent-1", number = NUMBER) {
  return w.handler.execute(
    new ReceivePeriodQuoteCommitmentCommand(w.quote.id, number, "staff_1", intent),
  );
}

describe("ReceivePeriodQuoteCommitmentHandler — l'engagement reçu", () => {
  it("écrit le numéro, émet la facture du devis, le passe facturé, journalise et scelle", async () => {
    const w = commitmentWorld();

    const invoiceId = await receive(w);

    expect(w.rows.locked).toEqual([{ ids: ["a", "b"], inside: true }]);
    expect(w.taking.receipts).toEqual([
      {
        quoteId: w.quote.id,
        quoteNumber: w.quote.number,
        orderIds: ["a", "b"],
        number: NUMBER,
        staffUserId: "staff_1",
      },
    ]);
    const [invoice] = w.invoices.inserted;
    const state = invoice?.toState();
    expect(invoice?.totalTtcCents).toBe(w.quote.totalTtcCents);
    expect(state).toMatchObject({
      id: invoiceId,
      budgetCommitment: { number: NUMBER, serviceCode: SERVICE_CODE },
      // Le jour du geste (après la veille de la clôture), et le délai de l'État.
      issuedOn: "2026-11-03",
      dueOn: "2026-12-03",
    });
    expect(state?.orders.map((order) => order.orderId)).toEqual(["a", "b"]);
    expect(w.quotes.quotes.get(w.quote.id)).toMatchObject({ state: "invoiced", invoiceId });
    const [outcome] = [...w.outcomes.rows.values()];
    expect(outcome).toMatchObject({
      invoiceId,
      key: {
        payerCompanyId: w.quote.payerCompanyId,
        periodClosesAt: w.quote.periodClosesAt,
        periodStartsAt: w.quote.periodStartsAt,
        budgetCommitment: { number: NUMBER, serviceCode: SERVICE_CODE },
      },
    });
    expect(w.durable.facts.map((fact) => fact.type)).toEqual([INVOICE_ISSUED]);
    expect(w.events.factTypes()).toEqual(["invoice.issued", PERIOD_QUOTE_COMMITMENT_RECEIVED]);
    expect(w.events.traced[1]?.journalFact().payload).toMatchObject({
      subjectLabel: `${w.quote.number} v1`,
      commitmentNumber: NUMBER,
      invoice: { id: invoiceId, name: invoice?.number },
      orderCount: 2,
    });
    expect(w.ledger.resolutions).toEqual(["in tx"]);
  });

  it("rejouée sous la même intention : la même facture, rien de réémis", async () => {
    const w = commitmentWorld();

    const first = await receive(w);
    const replay = await receive(w);

    expect(replay).toBe(first);
    expect(w.invoices.inserted).toHaveLength(1);
    expect(w.taking.receipts).toHaveLength(1);
  });

  it("lit le moyen au début de la période DU DEVIS : un virement posé après n'y est pas", async () => {
    const w = commitmentWorld({
      means: "bank_transfer",
      meansFrom: new Date("2026-10-15T00:00:00.000Z"),
    });

    // Au 1er octobre, le payeur n'était pas encore au virement : la règle
    // publique refuse la facture — le calendrier du jour l'aurait émise.
    await expect(receive(w)).rejects.toThrow(InvoiceIssuanceBlockedError);
    expect(w.invoices.inserted).toEqual([]);
    expect(w.quotes.quotes.get(w.quote.id)?.state).toBe("awaiting");
  });

  it("émet au virement quand le payeur l'était au début de la période du devis", async () => {
    const w = commitmentWorld();

    await receive(w);

    expect(w.invoices.inserted[0]?.toState().paymentMeans).toMatchObject({
      code: "58",
    });
  });
});

describe("ReceivePeriodQuoteCommitmentHandler — les refus", () => {
  it("une empreinte changée : refusée avant d'écrire le numéro, rien n'est émis ni scellé", async () => {
    const w = commitmentWorld();
    w.orders.set("b", { ...armyOrder("b", 3), budgetCommitment: { number: "", serviceCode: "" } });

    await expect(receive(w)).rejects.toThrow(PeriodQuoteCommitmentOutdatedError);
    await expect(receive(w)).rejects.toThrow(
      /Le devis n° D-20261031-1 \(version 1\) n'est plus à jour : renvoyez-le avant d'enregistrer l'engagement/u,
    );
    expect(w.taking.receipts).toEqual([]);
    expect(w.invoices.inserted).toEqual([]);
    expect(w.quotes.quotes.get(w.quote.id)?.state).toBe("awaiting");
    expect(w.ledger.resolutions).toEqual([]);
  });

  it("une commande annulée depuis l'envoi change l'empreinte : refusée", async () => {
    const w = commitmentWorld();
    w.orders.delete("b");

    await expect(receive(w)).rejects.toThrow(PeriodQuoteCommitmentOutdatedError);
    expect(w.taking.receipts).toEqual([]);
  });

  it("des commandes qui ne font plus UNE facture : refusé après relecture, rien n'est émis", async () => {
    const w = commitmentWorld();
    w.taking.codes.set("b", "SERV-AUTRE");

    await expect(receive(w)).rejects.toThrow(PeriodQuoteCommitmentGroupsError);
    await expect(receive(w)).rejects.toThrow(/ne tiennent plus en une seule facture \(2 groupes/u);
    expect(w.invoices.inserted).toEqual([]);
    expect(w.outcomes.rows.size).toBe(0);
    expect(w.quotes.quotes.get(w.quote.id)?.state).toBe("awaiting");
    expect(w.ledger.resolutions).toEqual([]);
  });

  it("un devis déjà facturé : refusé sans rien écrire", async () => {
    const w = commitmentWorld();
    await receive(w, "intent-1");

    await expect(receive(w, "intent-2")).rejects.toThrow(PeriodQuoteCommitmentClosedError);
    await expect(receive(w, "intent-2")).rejects.toThrow(/est déjà facturé/u);
    expect(w.invoices.inserted).toHaveLength(1);
    expect(w.taking.receipts).toHaveLength(1);
  });

  it("un devis remplacé : refusé, en renvoyant à la version en attente", async () => {
    const w = commitmentWorld();
    const stored = w.quotes.quotes.get(w.quote.id);
    if (stored === undefined) {
      throw new TypeError("le devis du monde est rangé");
    }
    w.quotes.quotes.set(w.quote.id, { ...stored, state: "superseded" });

    await expect(receive(w)).rejects.toThrow(/remplacé par une version plus récente/u);
    expect(w.taking.receipts).toEqual([]);
  });

  it("un numéro que la commande refuse : rien n'est émis ni scellé", async () => {
    const w = commitmentWorld();
    w.taking.refusal = new MalformedNumberError();

    await expect(receive(w, "intent-1", "13000\n12345")).rejects.toThrow("numéro mal formé");
    expect(w.invoices.inserted).toEqual([]);
    expect(w.quotes.quotes.get(w.quote.id)?.state).toBe("awaiting");
    expect(w.ledger.resolutions).toEqual([]);
  });

  it("un devis inconnu : 404", async () => {
    const w = commitmentWorld();

    await expect(
      w.handler.execute(new ReceivePeriodQuoteCommitmentCommand("absent", NUMBER, "s", "i")),
    ).rejects.toThrow(PeriodQuoteNotFoundError);
  });
});
