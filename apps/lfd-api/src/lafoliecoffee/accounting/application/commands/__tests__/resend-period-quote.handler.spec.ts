import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { SealingIntentLedger } from "../../../../../platform/intent/__tests__/sealing-intent-ledger.js";
import {
  PeriodQuoteNobodyToNotifyError,
  PeriodQuoteNotAwaitingError,
  PeriodQuoteNotFoundError,
} from "../../../domain/errors/period-quote-errors.js";
import { PERIOD_QUOTE_ISSUED } from "../../../domain/events/period-quote-issued.fact.js";
import type { PayerNoticeContacts } from "../../../domain/services/collection-notice-recipient.js";
import { armyOrder, quoteWorld } from "../../services/__tests__/period-quote-document-doubles.js";
import { ResendPeriodQuoteCommand } from "../resend-period-quote.command.js";
import { ResendPeriodQuoteHandler } from "../resend-period-quote.handler.js";

/**
 * « Renvoyer le devis » (QD4, QD5) : l'empreinte recalculée sur les commandes
 * du devis décide — la même version repart sous la clé de l'intention, ou une
 * version n+1 est rangée et part par l'envoi automatique.
 */

function setup(contacts?: PayerNoticeContacts | null) {
  const w = quoteWorld(contacts === undefined ? {} : { contacts });
  const ledger = new SealingIntentLedger(() => w.uow.open);
  const handler = new ResendPeriodQuoteHandler(
    w.reviser,
    w.documents,
    w.sender,
    w.events,
    w.clock,
    w.uow,
    inMemoryIntents(ledger),
  );
  function resend(intentKey: string, quoteId = w.quote.id): Promise<string> {
    return handler.execute(new ResendPeriodQuoteCommand(quoteId, "staff_1", intentKey));
  }
  return { ...w, ledger, resend };
}

describe("ResendPeriodQuoteHandler — la même version", () => {
  it("repart sous la clé de l'intention, au journal, scellée dans la transaction", async () => {
    const h = setup();

    const sent = await h.resend("intent-1");

    expect(sent).toBe(h.quote.id);
    expect(h.mails.queued.map((mail) => [mail.to, mail.idempotencyKey])).toEqual([
      ["intendance@caserne.test", "period-quote-resend:intent-1:contact:1"],
    ]);
    expect(h.events.factTypes()).toEqual(["period_quote.resent"]);
    expect(h.events.traced[0]?.journalFact().payload).toMatchObject({
      subjectLabel: "D-20261031-1 v1",
      version: 1,
      renewed: false,
      recipientCount: 1,
    });
    expect(h.ledger.resolutions).toEqual(["in tx"]);
    expect(h.durable.facts).toEqual([]);
    expect(h.quotes.all()).toHaveLength(1);
    expect(h.rows.locked).toEqual([{ ids: ["a", "b"], inside: true }]);
  });

  it("un double clic ne renvoie rien ; un nouveau « Renvoyer » repart", async () => {
    const h = setup();

    await h.resend("intent-1");
    await h.resend("intent-1");
    await h.resend("intent-2");

    expect(h.mails.queued.map((mail) => mail.idempotencyKey)).toEqual([
      "period-quote-resend:intent-1:contact:1",
      "period-quote-resend:intent-2:contact:1",
    ]);
  });

  it("joint le PDF déjà rangé, sans le rendre à nouveau", async () => {
    const h = setup();

    await h.resend("intent-1");
    await h.resend("intent-2");

    expect(h.kept.saved).toEqual(["quotes/le_1/D-20261031-1-v1.pdf"]);
  });

  it("sans personne à prévenir : 409 nommé, rien au journal, rien de scellé", async () => {
    const h = setup(null);

    await expect(h.resend("intent-1")).rejects.toThrow(PeriodQuoteNobodyToNotifyError);

    expect(h.events.factTypes()).toEqual([]);
    expect(h.ledger.resolutions).toEqual([]);
  });
});

describe("ResendPeriodQuoteHandler — les commandes ont changé", () => {
  it("range la version 2, remplace la 1, et son fait la fera partir ; le geste n'envoie rien lui-même", async () => {
    const h = setup();
    h.orders.set("a", armyOrder("a", 3));

    const sent = await h.resend("intent-1");

    const v2 = h.quotes.quotes.get(sent);
    expect(v2).toMatchObject({ number: "D-20261031-1", version: 2, state: "awaiting" });
    expect(h.quotes.quotes.get(h.quote.id)?.state).toBe("superseded");
    expect(h.durable.facts).toEqual([
      {
        type: PERIOD_QUOTE_ISSUED,
        key: `${PERIOD_QUOTE_ISSUED}:${sent}`,
        payload: { quoteId: sent },
      },
    ]);
    expect(h.mails.queued).toEqual([]);
    expect(h.events.traced[0]?.journalFact().payload).toMatchObject({
      subjectLabel: "D-20261031-1 v2",
      renewed: true,
      recipientCount: null,
    });
    expect(h.ledger.resolutions).toEqual(["in tx"]);
  });

  it("une commande annulée depuis le rangement sort de la version 2", async () => {
    const h = setup();
    h.orders.delete("b");

    const sent = await h.resend("intent-1");

    expect(h.quotes.quotes.get(sent)?.orderIds).toEqual(["a"]);
  });
});

describe("ResendPeriodQuoteHandler — les refus", () => {
  it.each(["superseded", "invoiced"] as const)("un devis %s ne se renvoie pas", async (state) => {
    const h = setup();
    h.quotes.quotes.set(h.quote.id, { ...h.quote, state });

    await expect(h.resend("intent-1")).rejects.toThrow(PeriodQuoteNotAwaitingError);

    expect(h.mails.queued).toEqual([]);
    expect(h.durable.facts).toEqual([]);
    expect(h.events.factTypes()).toEqual([]);
  });

  it("un devis inconnu : 404 nommé", async () => {
    const h = setup();

    await expect(h.resend("intent-1", "q_absent")).rejects.toThrow(PeriodQuoteNotFoundError);
  });

  it("un refus rend l'intention : le même clic se refait une fois la cause levée", async () => {
    const h = setup();
    h.quotes.quotes.set(h.quote.id, { ...h.quote, state: "superseded" });
    await expect(h.resend("intent-1")).rejects.toThrow(PeriodQuoteNotAwaitingError);
    h.quotes.quotes.set(h.quote.id, h.quote);

    await h.resend("intent-1");

    expect(h.mails.queued).toHaveLength(1);
  });
});
