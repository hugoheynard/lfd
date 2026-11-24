import { HeldAfterCommit } from "../../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import type { PayerNoticeContacts } from "../../../domain/services/collection-notice-recipient.js";
import { PERIOD_QUOTE_ISSUED } from "../../../domain/events/period-quote-issued.fact.js";
import { armyOrder, quoteWorld } from "../../services/__tests__/period-quote-document-doubles.js";
import { NO_QUOTE_RECIPIENT, SendPeriodQuote } from "../send-period-quote.handler.js";

/**
 * L'abonné de `period_quote.issued` (QD4) : le PDF rendu et rangé d'abord,
 * puis la demande d'e-mail au destinataire de la facture du payeur, la pièce
 * par référence ; sans destinataire, rien ne part et le manque est au journal.
 */

function setup(contacts?: PayerNoticeContacts | null) {
  const w = quoteWorld(contacts === undefined ? {} : { contacts });
  const afterCommit = new HeldAfterCommit();
  const work = new BackgroundWork();
  const handler = new SendPeriodQuote(w.reader, w.documents, w.sender, afterCommit, work);
  function receive(quoteId = w.quote.id): Promise<void> {
    return handler.handle({ eventId: "evt_1", type: PERIOD_QUOTE_ISSUED, payload: { quoteId } });
  }
  async function deliver(quoteId = w.quote.id): Promise<void> {
    await receive(quoteId);
    await afterCommit.commit();
    await work.whenIdle();
  }
  return { ...w, receive, deliver, afterCommit };
}

const KEY = "quotes/le_1/D-20261031-1-v1.pdf";

describe("SendPeriodQuote — « Devis D-… » part à la clôture", () => {
  it("rien ne part avant la validation de la transaction qui a rangé le devis", async () => {
    const h = setup();

    await h.receive();

    expect(h.kept.saved).toEqual([]);
    expect(h.mails.queued).toEqual([]);
  });

  it("range le PDF, puis demande l'e-mail au contact de facturation, la pièce par référence", async () => {
    const h = setup();

    await h.deliver();

    expect(h.kept.saved).toEqual([KEY]);
    expect(h.mails.queued).toHaveLength(1);
    expect(h.mails.queued[0]).toMatchObject({
      template: "customer.period-quote",
      to: "intendance@caserne.test",
      idempotencyKey: `period-quote:${h.quote.id}:contact:1`,
      subjects: [
        { type: "period_quote", id: h.quote.id },
        { type: "company", id: "c_army" },
      ],
      data: {
        quoteNumber: "D-20261031-1",
        version: 1,
        buyerName: "Caserne des Alpes",
        period: "du 01/10/2026 au 31/10/2026",
        serviceCode: "SERV-RH",
        document: {
          fileName: "D-20261031-1-v1.pdf",
          pdfStored: { store: "customer-documents", key: KEY },
        },
      },
    });
    expect(JSON.stringify(h.mails.queued[0]?.data)).not.toContain("pdfBase64");
  });

  it("sans contact de facturation, le détenteur reçoit le devis", async () => {
    const h = setup({
      billingContacts: [],
      owner: { id: "user:owner", email: "chef@caserne.test" },
    });

    await h.deliver();

    expect(h.mails.queued.map((mail) => [mail.to, mail.idempotencyKey])).toEqual([
      ["chef@caserne.test", `period-quote:${h.quote.id}:user:owner`],
    ]);
  });

  it("sans personne à prévenir, l'envoi n'est pas tenté et le manque est au journal", async () => {
    const h = setup(null);

    await h.deliver();

    expect(h.mails.queued).toEqual([]);
    expect(h.events.factTypes()).toEqual(["period_quote.notice_failed"]);
    expect(h.events.traced[0]?.journalFact().payload).toMatchObject({
      subjectLabel: "D-20261031-1 v1",
      failure: NO_QUOTE_RECIPIENT,
    });
  });

  it("relivré, il ne rend pas une seconde fois, et redemande sous la même clé (le bloc la tait)", async () => {
    const h = setup();
    await h.deliver();

    await h.deliver();

    expect(h.kept.saved).toEqual([KEY]);
    const keys = h.mails.queued.map((mail) => mail.idempotencyKey);
    expect(new Set(keys).size).toBe(1);
  });

  it("des commandes changées depuis le rangement : ni document ni e-mail, l'abonné ne lève pas", async () => {
    const h = setup();
    h.orders.set("a", armyOrder("a", 3));

    await expect(h.deliver()).resolves.toBeUndefined();

    expect(h.kept.saved).toEqual([]);
    expect(h.mails.queued).toEqual([]);
  });

  it("un devis déjà remplacé n'est pas envoyé", async () => {
    const h = setup();
    h.quotes.quotes.set(h.quote.id, { ...h.quote, state: "superseded" });

    await h.deliver();

    expect(h.mails.queued).toEqual([]);
  });
});
