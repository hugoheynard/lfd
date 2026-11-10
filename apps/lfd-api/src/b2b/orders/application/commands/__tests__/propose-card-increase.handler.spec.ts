import type { RevisableOrder } from "../../../domain/entities/order-revision.js";
import {
  CardComplementCancellationUnavailableError,
  CardComplementJustPaidError,
  CardIncreaseOnShelfOrderError,
  RevisionProposalPendingError,
} from "../../../domain/errors/card-increase-proposal-errors.js";
import {
  CardOrderNotRevisableError,
  OrderNotRevisableError,
  OrderRevisedElsewhereError,
} from "../../../domain/errors/order-revision-errors.js";
import { OrderTotalChangedError } from "../../../domain/errors/order-total-changed.error.js";
import type { OrderContent } from "../../services/order-content.js";
import { proposalAt } from "../../services/__tests__/card-increase-doubles.js";
import { ProposeCardIncreaseCommand } from "../propose-card-increase.command.js";
import { increaseScene } from "./card-increase-scene.js";
import { content, NOW, placedOrder } from "./revision-scene.js";

/**
 * **Demander une hausse payée par carte** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.4) — l'ordre
 * exact des six étapes, chaque refus avant le prestataire, le remplacement et
 * ses issues, et l'intention rendue sur tout échec de la transaction.
 */

const CUSTOMER = { kind: "customer", userId: "usr_1" } as const;
const MORE = content({ lines: [{ sku: "VIE-001", quantity: 20 }] });
const LESS = content({ lines: [{ sku: "VIE-001", quantity: 5 }] });
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const paidOrder = () => placedOrder({ paymentStatus: "paid", stripePaymentIntentId: "pi_1" });

/** Le TTC que le devis aurait montré pour ce contenu — le « total vu ». */
async function seenTotal(order: RevisableOrder, wanted: OrderContent): Promise<number> {
  const { revising } = increaseScene(order);
  const quoted = await revising.quote(order, wanted, CUSTOMER, {
    requireChange: false,
    decidedAt: NOW,
  });
  return quoted.revision.totalAfterCents;
}

async function proposeMore(
  order: RevisableOrder,
  actor: ProposeCardIncreaseCommand["actor"] = CUSTOMER,
): Promise<ProposeCardIncreaseCommand> {
  return new ProposeCardIncreaseCommand("ord_1", actor, 0, MORE, await seenTotal(order, MORE));
}

describe("ProposeCardIncreaseHandler — la hausse demandée", () => {
  it("dans l'ordre : préparation hors verrou, puis orders → fournil lu → projet → card-payment", async () => {
    const order = await paidOrder();
    const { handler, steps, journal, proposals, cards } = increaseScene(order);
    const command = await proposeMore(order);

    const result = await handler.execute(command);

    const complement = command.expectedTotalCents - order.totalCents;
    expect(steps.seen).toEqual([
      "liveOf:ord_1",
      `prepare:order:${String(complement)}:${String(order.companyId)}`,
      "lock:ord_1",
      "inscribed?:ord_1",
      "lockLiveProposal:ord_1",
      "attach:ord_1:pi_complement:complement",
      "saveProposal:new→awaiting_payment",
    ]);
    expect(result).toEqual({
      proposalId: "prop_000001",
      complementCents: complement,
      clientSecret: "pi_complement_secret",
      publishableKey: "pk_test",
      expiresAt: new Date(NOW.getTime() + FIFTEEN_MINUTES_MS).toISOString(),
    });
    expect(proposals.saved).toEqual(["awaiting_payment"]);
    expect(journal.types()).toEqual(["order.card_increase_proposed"]);
    expect(cards.released).toEqual([]);
  });

  it("R14 : un total vu faux refuse avant toute intention", async () => {
    const order = await paidOrder();
    const { handler, steps } = increaseScene(order);
    const command = await proposeMore(order);

    await expect(
      handler.execute(
        new ProposeCardIncreaseCommand("ord_1", CUSTOMER, 0, MORE, command.expectedTotalCents + 1),
      ),
    ).rejects.toBeInstanceOf(OrderTotalChangedError);
    expect(steps.seen).toEqual([]);
  });

  it.each([
    ["une baisse", LESS, "decrease"],
    ["un total égal", content({ note: "porte B" }), "same_total"],
  ] as const)("refuse %s, nommée, sans intention", async (_, wanted, reason) => {
    const order = await paidOrder();
    const { handler, steps } = increaseScene(order);

    const attempt = handler.execute(
      new ProposeCardIncreaseCommand("ord_1", CUSTOMER, 0, wanted, order.totalCents),
    );

    await expect(attempt).rejects.toBeInstanceOf(CardOrderNotRevisableError);
    await expect(attempt).rejects.toMatchObject({ reason });
    expect(steps.seen).toEqual([]);
  });

  it("R15 : l'équipe est refusée par le règlement, avant le total vu (un total faux exprès)", async () => {
    const order = await paidOrder();
    const { handler, steps } = increaseScene(order);
    const staff = { kind: "staff", staffId: "stf_1" } as const;

    const attempt = handler.execute(new ProposeCardIncreaseCommand("ord_1", staff, 0, MORE, 1));

    await expect(attempt).rejects.toMatchObject({ reason: "increase_by_staff" });
    expect(steps.seen).toEqual([]);
  });

  it("R7 : une révision qui n'est plus la courante est refusée avant tout", async () => {
    const order = await paidOrder();
    const { handler, steps } = increaseScene(order);

    await expect(
      handler.execute(new ProposeCardIncreaseCommand("ord_1", CUSTOMER, 3, MORE, 1)),
    ).rejects.toBeInstanceOf(OrderRevisedElsewhereError);
    expect(steps.seen).toEqual([]);
  });

  it("R1 : une commande prise sur le stock ne s'augmente pas", async () => {
    const order = await placedOrder({
      paymentStatus: "paid",
      stripePaymentIntentId: "pi_1",
      supply: "shelf",
    });
    const { handler } = increaseScene(order);

    await expect(
      handler.execute(new ProposeCardIncreaseCommand("ord_1", CUSTOMER, 0, MORE, 1)),
    ).rejects.toBeInstanceOf(CardIncreaseOnShelfOrderError);
  });
});

describe("ProposeCardIncreaseHandler — l'échec de la transaction rend l'intention", () => {
  it("une révision changée sous le verrou : refus, intention rendue, rien d'écrit", async () => {
    const order = await paidOrder();
    const { handler, steps, proposals, journal } = increaseScene(order, {
      underLock: { ...order, revision: 1 },
    });

    await expect(handler.execute(await proposeMore(order))).rejects.toBeInstanceOf(
      OrderRevisedElsewhereError,
    );
    expect(steps.seen.at(-1)).toBe("release:pi_complement");
    expect(proposals.saved).toEqual([]);
    expect(journal.facts).toEqual([]);
  });

  it("une journée inscrite entre-temps, lue au fournil : refus, intention rendue", async () => {
    const order = await paidOrder();
    const { handler, steps } = increaseScene(order, { inscribedDay: "2026-11-10" });

    await expect(handler.execute(await proposeMore(order))).rejects.toBeInstanceOf(
      OrderNotRevisableError,
    );
    expect(steps.seen).not.toContain("attach:ord_1:pi_complement:complement");
    expect(steps.seen.at(-1)).toBe("release:pi_complement");
  });

  it("le rattachement qui échoue : l'intention est rendue, et l'erreur remonte", async () => {
    const order = await paidOrder();
    const { handler, cards } = increaseScene(order);
    cards.attachFailure = new Error("ligne refusée");

    await expect(handler.execute(await proposeMore(order))).rejects.toThrow("ligne refusée");
    expect(cards.released).toHaveLength(1);
  });
});

describe("ProposeCardIncreaseHandler — le remplacement (R5)", () => {
  it("même auteur, en attente : intention annulée hors verrou, ancien abandonné, nouveau né", async () => {
    const order = await paidOrder();
    const { handler, steps, journal, proposals } = increaseScene(order, {
      live: proposalAt("awaiting_payment"),
    });

    await handler.execute(await proposeMore(order));

    expect(steps.seen.slice(0, 2)).toEqual(["liveOf:ord_1", "cancel:pay_2"]);
    expect(steps.seen).toContain("saveProposal:awaiting_payment→abandoned");
    expect(proposals.saved).toEqual(["abandoned", "awaiting_payment"]);
    expect(journal.types()).toEqual([
      "order.card_increase_abandoned",
      "order.card_increase_proposed",
    ]);
    expect(journal.facts[0]?.payload).toMatchObject({ cause: "replaced" });
  });

  it.each(["already_paid", "in_progress"] as const)(
    "l'ancien complément %s : « vient d'être payé », rien de préparé",
    async (kind) => {
      const order = await paidOrder();
      const { handler, steps, cards } = increaseScene(order, {
        live: proposalAt("awaiting_payment"),
      });
      cards.cancellation = { kind };

      await expect(handler.execute(await proposeMore(order))).rejects.toBeInstanceOf(
        CardComplementJustPaidError,
      );
      expect(steps.seen).toEqual(["liveOf:ord_1", "cancel:pay_2"]);
    },
  );

  it("le prestataire ne répond pas : « réessayez », rien de préparé", async () => {
    const order = await paidOrder();
    const { handler, cards, steps } = increaseScene(order, {
      live: proposalAt("awaiting_payment"),
    });
    cards.cancellation = { kind: "unavailable", reason: "timeout" };

    await expect(handler.execute(await proposeMore(order))).rejects.toBeInstanceOf(
      CardComplementCancellationUnavailableError,
    );
    expect(steps.seen).toEqual(["liveOf:ord_1", "cancel:pay_2"]);
  });

  it("déjà annulée : on continue", async () => {
    const order = await paidOrder();
    const { handler, cards, proposals } = increaseScene(order, {
      live: proposalAt("awaiting_payment"),
    });
    cards.cancellation = { kind: "already_cancelled" };

    await handler.execute(await proposeMore(order));

    expect(proposals.saved).toEqual(["abandoned", "awaiting_payment"]);
  });

  it("l'ancien passé `ready` sous le verrou (rien d'écrit) : refus nommé, intention rendue", async () => {
    const order = await paidOrder();
    const { handler, steps, journal } = increaseScene(order, {
      live: proposalAt("awaiting_payment"),
      proposalWritten: false,
    });

    await expect(handler.execute(await proposeMore(order))).rejects.toBeInstanceOf(
      CardComplementJustPaidError,
    );
    expect(steps.seen).not.toContain("attach:ord_1:pi_complement:complement");
    expect(steps.seen.at(-1)).toBe("release:pi_complement");
    expect(journal.facts).toEqual([]);
  });

  it("un autre auteur attend son paiement : refus nommé, jamais l'index brut, rien d'annulé", async () => {
    const order = await paidOrder();
    const { handler, steps } = increaseScene(order, { live: proposalAt("awaiting_payment") });
    const other = { kind: "customer", userId: "usr_2" } as const;

    await expect(handler.execute(await proposeMore(order, other))).rejects.toBeInstanceOf(
      RevisionProposalPendingError,
    );
    expect(steps.seen).toEqual(["liveOf:ord_1"]);
  });

  it.each(["ready", "stalled"] as const)(
    "un complément payé (%s) bloque toute nouvelle hausse",
    async (state) => {
      const order = await paidOrder();
      const { handler, steps } = increaseScene(order, { live: proposalAt(state) });

      await expect(handler.execute(await proposeMore(order))).rejects.toMatchObject({
        code: "orders.card_increase.pending",
      });
      expect(steps.seen).toEqual(["liveOf:ord_1"]);
    },
  );
});
