import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { InMemoryGestureIntentLedger } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { OncePerIntent } from "../../../../../platform/intent/once-per-intent.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  NoShortfallRefundError,
  ShortfallRefundBlockedError,
} from "../../../domain/errors/shortfall-refund-errors.js";
import {
  paidLine,
  refundSubject,
  shortfallRefundScene,
} from "../../services/__tests__/shortfall-refund-doubles.js";
import { RefundShortfallCommand } from "../refund-shortfall.command.js";
import { RefundShortfallHandler } from "../refund-shortfall.handler.js";

/**
 * **« Rembourser le reste »** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.5, § 4.6) —
 * le jugement de l'abonné, dans sa propre unité de travail : une cause rend
 * un 409 et rien n'est écrit ; une fois par intention.
 */

const INSTANT = new FixedClock(new Date(0));

function handlerOf(scene: ReturnType<typeof shortfallRefundScene>) {
  return new RefundShortfallHandler(
    scene.refunding,
    new DirectUnitOfWork(),
    new OncePerIntent(new InMemoryGestureIntentLedger(), INSTANT),
  );
}

const COMMAND = new RefundShortfallCommand("ord_1", "staff_1", "intent_1");

describe("RefundShortfallHandler", () => {
  it("demande le reste au nom de la fiche staff", async () => {
    const scene = shortfallRefundScene(refundSubject());

    await handlerOf(scene).execute(COMMAND);

    expect(scene.refunds.amounts).toEqual([
      expect.objectContaining({ paymentId: "pay_1", amountCents: 400, requestedBy: "staff_1" }),
    ]);
    expect(scene.journal.facts).toEqual([]);
  });

  it("la même clé ne demande rien de plus", async () => {
    const scene = shortfallRefundScene(refundSubject());
    const handler = handlerOf(scene);

    await handler.execute(COMMAND);
    await handler.execute(COMMAND);

    expect(scene.refunds.amounts).toHaveLength(1);
  });

  it("une autre clé, le reste déjà demandé : rien à rembourser (le recalcul sous verrou)", async () => {
    const scene = shortfallRefundScene(refundSubject());
    const handler = handlerOf(scene);
    await handler.execute(COMMAND);

    await expect(
      handler.execute(new RefundShortfallCommand("ord_1", "staff_1", "intent_2")),
    ).rejects.toBeInstanceOf(NoShortfallRefundError);
    expect(scene.refunds.amounts).toHaveLength(1);
  });

  it("une cause bloque encore : 409 avec sa phrase, aucune demande, aucun journal", async () => {
    const scene = shortfallRefundScene(refundSubject(), [paidLine("pay_1", 1_000)]);
    scene.ledger.requests.push({
      id: "req_ret",
      paymentId: "pay_1",
      nature: "return",
      state: "stopped",
      reason: "cancellation",
      announcedCents: 700,
    });

    const refusal = handlerOf(scene).execute(COMMAND);

    await expect(refusal).rejects.toBeInstanceOf(ShortfallRefundBlockedError);
    await expect(refusal).rejects.toMatchObject({ code: "orders.shortfall_refund.not_covered" });
    expect(scene.refunds.amounts).toEqual([]);
    expect(scene.journal.facts).toEqual([]);
  });

  it("une commande inconnue : 404", async () => {
    const scene = shortfallRefundScene(null);

    await expect(handlerOf(scene).execute(COMMAND)).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("une commande sans décision : rien à rembourser", async () => {
    const scene = shortfallRefundScene(refundSubject({ partial: false }));

    await expect(handlerOf(scene).execute(COMMAND)).rejects.toBeInstanceOf(NoShortfallRefundError);
  });
});
