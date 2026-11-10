import {
  CardIncreaseAfterCutoffError,
  CardIncreaseTransitionRefusedError,
  InvalidCardIncreaseProposalError,
  UnknownCardIncreaseStateError,
} from "../../errors/card-increase-proposal-errors.js";
import {
  CARD_INCREASE_MAX_ATTEMPTS,
  CARD_INCREASE_PAYMENT_DELAY_MS,
  CARD_INCREASE_STATES,
  CardIncreaseProposal,
  type CardIncreaseState,
  type ProposedIncrease,
} from "../card-increase-proposal.js";

/**
 * **Le projet de hausse par carte** (plan S2, §1, §2.2) — la machine des sept
 * états : chaque transition permise, chaque transition refusée. Les instants
 * ne sont comparés qu'entre eux, jamais à une horloge.
 */

const NOW = new Date(0);
const LATER = new Date(60_000);
const MINUTES = 60_000;

function proposal(overrides: Partial<ProposedIncrease> = {}): CardIncreaseProposal {
  return CardIncreaseProposal.propose({
    id: "prop_1",
    orderId: "ord_1",
    baseRevision: 2,
    content: { lines: [] },
    rules: { rulesOf: "customer" },
    totalBeforeCents: 4000,
    targetTotalCents: 5200,
    author: { kind: "customer", userId: "usr_1" },
    paymentId: "pay_2",
    now: NOW,
    cutoff: null,
    ...overrides,
  });
}

/** Un projet relu en base à cet état. */
function at(state: CardIncreaseState): CardIncreaseProposal {
  return CardIncreaseProposal.rehydrate({ ...proposal().toPersistence(), state });
}

/** Les gestes, chacun nommé par l'état qu'il vise. */
const GESTURES: Readonly<Record<string, (p: CardIncreaseProposal) => void>> = {
  markPaid: (p) => p.markPaid(LATER),
  abandon: (p) => p.abandon(LATER),
  apply: (p) => p.apply(LATER),
  refuse: (p) => p.refuse("plan_closed", LATER),
  recordFailure: (p) => p.recordFailure("boom", LATER),
  relaunch: (p) => p.relaunch(LATER),
  closeLatePayment: (p) => p.closeLatePayment(LATER),
};

/** La machine du §1 : d'où chaque geste part. */
const ALLOWED: Readonly<Record<string, readonly CardIncreaseState[]>> = {
  markPaid: ["awaiting_payment"],
  abandon: ["awaiting_payment"],
  apply: ["ready"],
  refuse: ["ready", "stalled"],
  recordFailure: ["ready"],
  relaunch: ["stalled"],
  closeLatePayment: ["abandoned"],
};

const TARGET: Readonly<Record<string, CardIncreaseState>> = {
  markPaid: "ready",
  abandon: "abandoned",
  apply: "applied",
  refuse: "refused",
  recordFailure: "ready",
  relaunch: "ready",
  closeLatePayment: "closed",
};

describe("CardIncreaseProposal.propose — une hausse demandée", () => {
  it("naît en attente de paiement, avec le complément = l'écart des totaux", () => {
    const born = proposal().toPersistence();
    expect(born.state).toBe("awaiting_payment");
    expect(born.complementCents).toBe(1200);
    expect(born.attempts).toBe(0);
    expect(proposal().expectedState).toBeNull();
  });

  it("donne 15 minutes pour payer sans heure limite", () => {
    expect(proposal().toPersistence().expiresAt.getTime()).toBe(CARD_INCREASE_PAYMENT_DELAY_MS);
  });

  it("raccourcit le délai à l'heure limite si elle tombe avant (Q1)", () => {
    const cutoff = new Date(5 * MINUTES);
    expect(proposal({ cutoff }).toPersistence().expiresAt).toEqual(cutoff);
  });

  it("garde 15 minutes quand l'heure limite tombe après", () => {
    const cutoff = new Date(60 * MINUTES);
    expect(proposal({ cutoff }).toPersistence().expiresAt.getTime()).toBe(
      CARD_INCREASE_PAYMENT_DELAY_MS,
    );
  });

  it("refuse une heure limite déjà passée", () => {
    expect(() => proposal({ cutoff: NOW })).toThrow(CardIncreaseAfterCutoffError);
  });

  it.each([
    ["une baisse", 3000],
    ["un total égal", 4000],
  ])("refuse %s : ce n'est pas une hausse", (_, target) => {
    expect(() => proposal({ targetTotalCents: target })).toThrow(InvalidCardIncreaseProposalError);
  });

  it("refuse un paiement ou une commande vides, une révision négative", () => {
    expect(() => proposal({ paymentId: " " })).toThrow(InvalidCardIncreaseProposalError);
    expect(() => proposal({ orderId: "" })).toThrow(InvalidCardIncreaseProposalError);
    expect(() => proposal({ baseRevision: -1 })).toThrow(InvalidCardIncreaseProposalError);
  });

  it("est vivant tant qu'il attend, est payé ou en panne (R5)", () => {
    expect(at("awaiting_payment").live).toBe(true);
    expect(at("ready").live).toBe(true);
    expect(at("stalled").live).toBe(true);
    for (const state of ["applied", "refused", "abandoned", "closed"] as const) {
      expect(at(state).live).toBe(false);
    }
  });
});

describe("CardIncreaseProposal — la machine des sept états", () => {
  const cases = Object.keys(GESTURES).flatMap((gesture) =>
    CARD_INCREASE_STATES.map((state) => [gesture, state] as const),
  );

  it.each(cases)("%s depuis %s", (gesture, state) => {
    const subject = at(state);
    const act = () => GESTURES[gesture]?.(subject);
    if (ALLOWED[gesture]?.includes(state) === true) {
      act();
      expect(subject.state).toBe(TARGET[gesture]);
      // La condition d'écriture reste l'état RELU.
      expect(subject.expectedState).toBe(state);
    } else {
      expect(act).toThrow(CardIncreaseTransitionRefusedError);
      expect(subject.state).toBe(state);
    }
  });
});

describe("CardIncreaseProposal — ce que chaque transition écrit", () => {
  it("payé : `settled_at` et le réveil de l'exécuteur", () => {
    const paid = at("awaiting_payment");
    paid.markPaid(LATER);
    expect(paid.toPersistence()).toMatchObject({ settledAt: LATER, nextAttemptAt: LATER });
  });

  it("refusé : le code du refus et la fermeture", () => {
    const refused = at("ready");
    refused.refuse("total_changed", LATER);
    expect(refused.toPersistence()).toMatchObject({ refusal: "total_changed", closedAt: LATER });
  });

  it("refuse un refus sans code", () => {
    expect(() => at("ready").refuse(" ", LATER)).toThrow(InvalidCardIncreaseProposalError);
  });

  it("une panne compte un essai et reporte le suivant", () => {
    const failing = at("ready");
    expect(failing.recordFailure("db", LATER)).toBe(false);
    expect(failing.toPersistence()).toMatchObject({
      attempts: 1,
      lastFailure: "db",
      nextAttemptAt: LATER,
      state: "ready",
    });
  });

  it(`passe en panne au ${CARD_INCREASE_MAX_ATTEMPTS}ᵉ essai, et Relancer repart de zéro`, () => {
    const failing = at("ready");
    const verdicts = Array.from({ length: CARD_INCREASE_MAX_ATTEMPTS }, () =>
      failing.recordFailure("db", LATER),
    );
    expect(verdicts.at(-1)).toBe(true);
    expect(failing.state).toBe("stalled");
    failing.relaunch(LATER);
    expect(failing.toPersistence()).toMatchObject({ state: "ready", attempts: 0 });
  });

  it("payé tard : fermé, l'encaissement daté", () => {
    const late = at("abandoned");
    late.closeLatePayment(LATER);
    expect(late.toPersistence()).toMatchObject({ state: "closed", settledAt: LATER });
  });

  it("un contrôle au prestataire en échec : compté à part des essais, la cloche au 3ᵉ exactement", () => {
    const awaiting = at("awaiting_payment");
    const verdicts = [1, 2, 3, 4].map(() => awaiting.recordProviderCheckFailure());
    expect(verdicts).toEqual([false, false, true, false]);
    expect(awaiting.toPersistence()).toMatchObject({
      state: "awaiting_payment",
      providerChecks: 4,
      attempts: 0,
    });
  });

  it.each(["ready", "abandoned"] as const)(
    "un projet `%s` n'attend plus son paiement : aucun contrôle à compter",
    (state) => {
      expect(() => at(state).recordProviderCheckFailure()).toThrow(
        CardIncreaseTransitionRefusedError,
      );
    },
  );

  it("refuse de relire un état inconnu", () => {
    expect(() =>
      CardIncreaseProposal.rehydrate({ ...proposal().toPersistence(), state: "lost" }),
    ).toThrow(UnknownCardIncreaseStateError);
  });
});
