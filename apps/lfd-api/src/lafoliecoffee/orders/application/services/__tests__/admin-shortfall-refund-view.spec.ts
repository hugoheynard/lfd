import { AdminShortfallRefundView } from "../admin-shortfall-refund-view.js";
import { paidLine, refundSubject, shortfallRefundScene } from "./shortfall-refund-doubles.js";

/**
 * **« Rembourser le reste » sur la fiche commande** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.5) — lu sur
 * l'état, sans verrou ni adoption : le bouton se montre quand le geste a un
 * sens, jamais pour une cause qu'il ne répare pas.
 */

function viewOf(scene: ReturnType<typeof shortfallRefundScene>) {
  return new AdminShortfallRefundView(scene.subjects, scene.money);
}

describe("AdminShortfallRefundView", () => {
  it("un reste remboursable : son montant, sans cause, et rien n'est adopté", async () => {
    const scene = shortfallRefundScene(refundSubject());

    expect(await viewOf(scene).of("ord_1")).toEqual({ amountCents: 400, cause: null });
    expect(scene.trace).toEqual(["read:ord_1"]);
  });

  it("des restes qui ne couvrent pas : la cause, que le geste répare après « Relancer »", async () => {
    const scene = shortfallRefundScene(refundSubject());
    scene.ledger.requests.push({
      id: "req_ret",
      paymentId: "pay_1",
      nature: "return",
      state: "stopped",
      reason: "cancellation",
      announcedCents: 700,
    });

    expect(await viewOf(scene).of("ord_1")).toEqual({ amountCents: 400, cause: "not_covered" });
  });

  it("une hausse vivante : le reste calculé, et la cause", async () => {
    const scene = shortfallRefundScene(refundSubject({ increasePending: true }));

    expect(await viewOf(scene).of("ord_1")).toEqual({
      amountCents: 400,
      cause: "increase_pending",
    });
  });

  it.each([
    ["une facture émise", refundSubject({ invoiced: true })],
    ["sans décision", refundSubject({ partial: false })],
    ["sans solde", refundSubject({ billableTotalCents: null })],
    ["rien à rendre", refundSubject({ billableTotalCents: 1_000 })],
  ])("%s : pas de bouton", async (_case, subject) => {
    expect(await viewOf(shortfallRefundScene(subject)).of("ord_1")).toBeNull();
  });

  it("un remboursement hors plateforme : pas de bouton, même avec une hausse vivante", async () => {
    const scene = shortfallRefundScene(refundSubject({ increasePending: true }));
    scene.ledger.succeeded.push({
      refundId: "re_x",
      paymentId: "pay_1",
      requestId: null,
      amountCents: 10,
      nature: null,
      source: "provider",
    });

    expect(await viewOf(scene).of("ord_1")).toBeNull();
  });

  it("une demande du reste existe déjà, dans n'importe quel état : pas de bouton", async () => {
    const scene = shortfallRefundScene(refundSubject(), [paidLine("pay_1", 1_000)]);
    scene.ledger.requests.push({
      id: "req_1",
      paymentId: "pay_1",
      nature: "adjustment",
      state: "stopped",
      reason: "shortfall",
      announcedCents: 400,
    });

    expect(await viewOf(scene).of("ord_1")).toBeNull();
  });
});
