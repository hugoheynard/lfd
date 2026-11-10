import { ORDER_CARD_INCREASE_REFUSED } from "../../../domain/events/order-card-increase-refused.event.js";
import type { RevisableOrder } from "../../../domain/entities/order-revision.js";
import { CARD_INCREASE_RETRY_DELAYS_MS } from "../../services/card-increase-outcomes.js";
import { ApplyCardIncreaseCommand } from "../apply-card-increase.command.js";
import { applyScene, CUSTOMER, increaseProposal, MORE } from "./card-increase-apply-scene.js";
import { increaseScene } from "./card-increase-scene.js";
import { FixedClosedPlans, gateOf, RecordingAdmissionDesk } from "./plan-doubles.js";
import { DAY, NOW, placedOrder } from "./revision-scene.js";

/**
 * **L'exécuteur des hausses payées** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.6) —
 * l'ordre exact des cinq étapes, chaque refus métier rendu `refused` avec son
 * fait durable, la garde propre au projet (plan arrêté), le total payé qui
 * fait foi (R7), et la panne qui reprend puis s'arrête en `stalled`.
 */

const paidOrder = () => placedOrder({ paymentStatus: "paid", stripePaymentIntentId: "pi_1" });

/** Le total que la hausse a figé : celui que le devis montrait au client. */
async function targetOf(order: RevisableOrder): Promise<number> {
  const quoted = await increaseScene(order).revising.quote(order, MORE, CUSTOMER, {
    requireChange: false,
    decidedAt: NOW,
  });
  return quoted.revision.totalAfterCents;
}

const run = () => new ApplyCardIncreaseCommand("prop_1");

describe("ApplyCardIncreaseHandler — appliquer une hausse payée", () => {
  it("dans l'ordre : bail, relecture hors verrou, puis orders → projet → fournil → écriture → projet appliqué", async () => {
    const order = await paidOrder();
    const target = await targetOf(order);
    const { handler, trace, proposals, journal, revise } = applyScene(
      order,
      increaseProposal(order, target),
    );

    await handler.execute(run());

    expect(trace).toEqual([
      "lease:prop_1",
      "find:prop_1",
      "lock:ord_1",
      "lockLiveProposal:ord_1",
      `desk:${DAY}`,
      "save:r1",
      "saveProposal:ready→applied",
    ]);
    expect(proposals.saved).toEqual(["applied"]);
    expect(journal.types()).toEqual(["order.card_increase_applied"]);
    expect(journal.facts[0]?.payload).toMatchObject({ revision: 1 });
    expect(revise.revisions.saved[0]?.author).toEqual(CUSTOMER);
    expect(revise.revisions.saved[0]?.revision.totalAfterCents).toBe(target);
    expect(revise.durable.facts.map((fact) => fact.type)).toEqual([
      "order.revised",
      "commerce.order_revised",
    ]);
  });

  it("R2 : la révision d'une commande carte ne recale aucune ligne d'encaissement", async () => {
    const order = await paidOrder();
    const { handler, revise } = applyScene(order, increaseProposal(order, await targetOf(order)));

    await handler.execute(run());

    expect(revise.revaluation.revalued).toEqual([]);
  });

  it("bail tenu ailleurs : rien n'est relu, rien n'est écrit", async () => {
    const order = await paidOrder();
    const { handler, trace } = applyScene(order, increaseProposal(order, await targetOf(order)), {
      leaseGranted: false,
    });

    await handler.execute(run());

    expect(trace).toEqual(["lease:prop_1"]);
  });

  it("un projet qui n'est plus `ready` ne fait rien", async () => {
    const order = await paidOrder();
    const proposal = increaseProposal(order, await targetOf(order), { state: "awaiting_payment" });
    const { handler, trace, journal } = applyScene(order, proposal);

    await handler.execute(run());

    expect(trace).toEqual(["lease:prop_1", "find:prop_1"]);
    expect(journal.types()).toEqual([]);
  });
});

describe("ApplyCardIncreaseHandler — les refus métier rendent le complément", () => {
  async function refusedBy(scene: ReturnType<typeof applyScene>): Promise<unknown> {
    await scene.handler.execute(run());
    expect(scene.proposals.saved).toEqual(["refused"]);
    expect(scene.journal.types()).toEqual(["order.card_increase_refused"]);
    expect(scene.revise.revisions.saved).toEqual([]);
    const [fact] = scene.durable.facts;
    expect(fact?.type).toBe(ORDER_CARD_INCREASE_REFUSED);
    expect(fact?.payload).toMatchObject({ proposalId: "prop_1", paymentId: "pay_2" });
    return fact?.payload["refusal"];
  }

  it("journée inscrite entre-temps au fournil : refusée, rien d'écrit sur la commande", async () => {
    const order = await paidOrder();
    const scene = applyScene(order, increaseProposal(order, await targetOf(order)), {
      desk: "inscribed",
    });

    expect(await refusedBy(scene)).toBe("orders.revise.inscribed");
  });

  it("R6 : plan arrêté, auteur client — `plan_closed`", async () => {
    const order = await paidOrder();
    const plans = gateOf(new FixedClosedPlans([DAY]), new RecordingAdmissionDesk([DAY]));
    const scene = applyScene(order, increaseProposal(order, await targetOf(order)), { plans });

    expect(await refusedBy(scene)).toBe("plan_closed");
  });

  /**
   * R6 voudrait `plan_closed` pour un projet de l'équipe ; R15 refuse toute
   * hausse carte de l'équipe dès la recomposition (`increase_by_staff`), avant
   * la garde. Un tel projet ne naît pas aujourd'hui (§2.12) ; s'il existait,
   * il serait refusé et rendu — jamais appliqué « hors plan ».
   */
  it("R6 et R15 : plan arrêté, auteur équipe — refusé avant la garde, jamais appliqué", async () => {
    const order = await paidOrder();
    const plans = gateOf(new FixedClosedPlans([DAY]), new RecordingAdmissionDesk([DAY]));
    const proposal = increaseProposal(order, await targetOf(order), {
      author: { kind: "staff", staffId: "stf_1" },
    });
    const scene = applyScene(order, proposal, { plans });

    expect(await refusedBy(scene)).toBe("orders.revise.card_settled");
  });

  it("R7 : le total recomposé n'est plus le total payé — `total_changed`, même en faveur du client", async () => {
    const order = await paidOrder();
    const scene = applyScene(order, increaseProposal(order, (await targetOf(order)) + 1));

    expect(await refusedBy(scene)).toBe("total_changed");
  });

  it("R7 : la commande a été modifiée ailleurs sous le verrou", async () => {
    const order = await paidOrder();
    const scene = applyScene(order, increaseProposal(order, await targetOf(order)), {
      underLock: { ...order, revision: 1 },
    });

    expect(await refusedBy(scene)).toBe("orders.revise.stale_revision");
  });
});

describe("ApplyCardIncreaseHandler — la panne reprend, puis s'arrête", () => {
  it("une panne : un essai de plus, le prochain sur la courbe, pas de refus", async () => {
    const order = await paidOrder();
    const proposal = increaseProposal(order, await targetOf(order));
    const scene = applyScene(order, proposal, { readFailure: new Error("base injoignable") });

    await scene.handler.execute(run());

    const state = proposal.toPersistence();
    expect(state).toMatchObject({ state: "ready", attempts: 1, lastFailure: "base injoignable" });
    expect(state.nextAttemptAt).toEqual(
      new Date(NOW.getTime() + (CARD_INCREASE_RETRY_DELAYS_MS[0] ?? 0)),
    );
    expect(scene.journal.types()).toEqual([]);
    expect(scene.durable.facts).toEqual([]);
    expect(scene.notifier.notices).toEqual([]);
  });

  it("la 5ᵉ panne : `stalled`, son journal, et la cloche", async () => {
    const order = await paidOrder();
    const proposal = increaseProposal(order, await targetOf(order), { attempts: 4 });
    const scene = applyScene(order, proposal, { readFailure: new Error("base injoignable") });

    await scene.handler.execute(run());

    expect(proposal.state).toBe("stalled");
    expect(scene.proposals.saved).toEqual(["stalled"]);
    expect(scene.journal.types()).toEqual(["order.card_increase_stalled"]);
    expect(scene.notifier.notices.map((notice) => notice.kind)).toEqual([
      "order.card_increase_stalled",
    ]);
    expect(scene.notifier.notices[0]?.link).toBe("/commandes/ord_1");
  });
});
