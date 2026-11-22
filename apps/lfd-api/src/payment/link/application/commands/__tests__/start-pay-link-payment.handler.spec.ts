import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RegisteredLinkableSubjects } from "../../../../channels/subjects/linkable-subjects.js";
import { RegisteredSubjectSettlements } from "../../../../channels/subjects/subject-settlements.js";
import {
  TestSubjectSettlement,
  Timeline,
} from "../../../../card/application/__tests__/card-payment-doubles.js";
import { PayLink } from "../../../domain/entities/pay-link.js";
import {
  PayLinkIntentClosedError,
  PayLinkNotFoundError,
  PayLinkSubjectNotPayableError,
} from "../../../domain/errors/pay-link-errors.js";
import { LivePayLinkLookup } from "../../live-pay-link-lookup.js";
import {
  InMemoryPayLinks,
  ScriptedCards,
  ScriptedFirsts,
  ScriptedLinkable,
  TransparentVault,
} from "../../__tests__/pay-link-doubles.js";
import { StartPayLinkPaymentCommand } from "../start-pay-link-payment.command.js";
import { StartPayLinkPaymentHandler } from "../start-pay-link-payment.handler.js";

const TOKEN = "tok_1";
const KEY = "free_charge:fc_1";

async function scene() {
  const links = new InMemoryPayLinks();
  await links.addIfAbsent(
    PayLink.open({
      id: "pl_1",
      subjectType: "free_charge",
      subjectId: "fc_1",
      origin: "lafoliecoffee",
      payerLabel: "Café des Arts",
      tokenHash: `hash:${TOKEN}`,
      tokenSealed: `sealed:${TOKEN}`,
      at: new Date(0),
      by: "system",
    }),
  );
  const timeline = new Timeline();
  const linkable = new ScriptedLinkable();
  const firsts = new ScriptedFirsts();
  const cards = new ScriptedCards();
  const handler = new StartPayLinkPaymentHandler(
    new LivePayLinkLookup(links, new TransparentVault()),
    new RegisteredLinkableSubjects([linkable]),
    new RegisteredSubjectSettlements([new TestSubjectSettlement(timeline, "free_charge")]),
    firsts,
    cards,
    new DirectUnitOfWork(),
  );
  const run = (token = TOKEN) => handler.execute(new StartPayLinkPaymentCommand(token));
  return { links, timeline, linkable, firsts, cards, run };
}

describe("StartPayLinkPaymentHandler", () => {
  it("crée l'intention hors du verrou, puis rattache un first qui porte le lien", async () => {
    const { cards, timeline, run } = await scene();
    const start = await run();
    expect(start).toEqual({
      collection: { kind: "embedded", provider: "stripe", publishableKey: "pk", token: "pi_new_s" },
      amountCents: 12_500,
    });
    expect(cards.calls).toEqual(["prepare:free_charge:12500:pay-link:pl_1", "attach:pi_new:first"]);
    expect(cards.attached).toEqual([
      {
        subject: { type: "free_charge", id: "fc_1" },
        role: "first",
        source: { payLinkId: "pl_1" },
      },
    ]);
    expect(timeline.steps).toEqual(["channel.lockSubject:fc_1"]);
  });

  it("relit le first existant au lieu d'en créer un second (le rejeu)", async () => {
    const { cards, firsts, run } = await scene();
    firsts.bySubject.set(KEY, { paymentId: "pay_old", amountCents: 9_900 });
    const start = await run();
    expect(cards.calls).toEqual(["retrieve:pay_old"]);
    expect(start.amountCents).toBe(9_900);
    expect(start.collection).toMatchObject({ token: "pi_old_s" });
  });

  it("course perdue sous le verrou : l'intention de trop est libérée, le gagnant relu", async () => {
    const { cards, firsts, run } = await scene();
    firsts.appearOnRead = { at: 2, first: { paymentId: "pay_won", amountCents: 12_500 } };
    const start = await run();
    expect(cards.calls).toEqual([
      "prepare:free_charge:12500:pay-link:pl_1",
      "release:pi_new",
      "retrieve:pay_won",
    ]);
    expect(start.collection).toMatchObject({ token: "pi_old_s" });
  });

  it("une écriture qui échoue libère l'intention et rend l'erreur", async () => {
    const { cards, run } = await scene();
    const failure = new Error("base indisponible");
    cards.attachFailure = failure;
    await expect(run()).rejects.toBe(failure);
    expect(cards.calls).toContain("release:pi_new");
  });

  it("répond 409 « lien à refaire » quand l'intention relue est close", async () => {
    const { cards, firsts, run } = await scene();
    firsts.bySubject.set(KEY, { paymentId: "pay_old", amountCents: 12_500 });
    cards.retrievedState = "canceled";
    await expect(run()).rejects.toBeInstanceOf(PayLinkIntentClosedError);
  });

  it("refuse un sujet qui n'est plus dû, sans appeler le prestataire", async () => {
    const { cards, linkable, run } = await scene();
    linkable.quote_ = { payable: false, reason: "settled" };
    await expect(run()).rejects.toBeInstanceOf(PayLinkSubjectNotPayableError);
    expect(cards.calls).toEqual([]);
  });

  it("répond le même 404 pour un jeton inconnu et pour un lien révoqué", async () => {
    const { links, run } = await scene();
    await expect(run("inconnu")).rejects.toBeInstanceOf(PayLinkNotFoundError);
    const live = await links.liveOf("free_charge", "fc_1");
    live?.revoke("réglé", new Date(0));
    if (live !== null) {
      await links.save(live);
    }
    await expect(run()).rejects.toBeInstanceOf(PayLinkNotFoundError);
  });
});
