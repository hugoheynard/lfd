import Stripe from "stripe";

import {
  cancellationFromError,
  refusedWithoutState,
  cancellationFromRefusedState,
  intentStateOf,
} from "../stripe-intent-translation.js";

describe("intentStateOf", () => {
  it.each([
    ["requires_payment_method", "awaiting_payment"],
    ["requires_confirmation", "awaiting_payment"],
    ["requires_action", "awaiting_payment"],
    ["requires_capture", "awaiting_payment"],
    ["processing", "processing"],
    ["succeeded", "succeeded"],
    ["canceled", "canceled"],
  ] as const)("%s → %s", (status, state) => {
    expect(intentStateOf(status)).toBe(state);
  });
});

describe("cancellationFromRefusedState", () => {
  it("une intention déjà annulée est le second clic : l'état voulu est atteint", () => {
    expect(cancellationFromRefusedState("canceled")).toEqual({ kind: "already_cancelled" });
  });

  it("une intention encaissée n'est pas annulée : on ne touche à rien", () => {
    expect(cancellationFromRefusedState("succeeded")).toEqual({ kind: "already_paid" });
  });

  it("un paiement en cours : on ne se prononce pas", () => {
    expect(cancellationFromRefusedState("processing")).toEqual({ kind: "in_progress" });
  });

  it("un statut sans sens connu, ou absent, se rend comme une réponse illisible", () => {
    expect(cancellationFromRefusedState("requires_capture").kind).toBe("unavailable");
    expect(cancellationFromRefusedState(undefined).kind).toBe("unavailable");
  });
});

describe("cancellationFromError", () => {
  it("un réseau injoignable est une issue, pas une exception", () => {
    const error = new Stripe.errors.StripeConnectionError({ message: "délai dépassé" });
    expect(cancellationFromError(error)).toMatchObject({ kind: "unavailable" });
  });

  it("une panne Stripe (5xx) est une issue, pas une exception", () => {
    const error = new Stripe.errors.StripeAPIError({ message: "boom", statusCode: 500 });
    expect(cancellationFromError(error)).toMatchObject({ kind: "unavailable" });
  });

  it("un refus d'une autre nature que l'état de l'intention ne dit rien d'elle", () => {
    const error = new Stripe.errors.StripeInvalidRequestError({
      code: "resource_missing",
      statusCode: 404,
    });
    expect(cancellationFromError(error)).toMatchObject({ kind: "unavailable" });
  });

  it("un « état inattendu » sans intention jointe ne se devine pas", () => {
    const error = new Stripe.errors.StripeInvalidRequestError({
      code: "payment_intent_unexpected_state",
      statusCode: 400,
    });
    expect(cancellationFromError(error)).toMatchObject({ kind: "unavailable" });
  });

  it("une erreur qui n'est pas de Stripe est rendue, jamais relancée", () => {
    expect(cancellationFromError(new TypeError("x"))).toEqual({ kind: "unavailable", reason: "x" });
  });
});

describe("refusedWithoutState — quand il faut relire l'intention", () => {
  /**
   * Stripe peut refuser l'annulation sans joindre l'intention. Sans relecture,
   * le second clic sur « abandonner » — intention déjà annulée — passerait pour
   * une panne de Stripe (2026-09-26).
   */
  it("un « état inattendu » sans intention jointe demande une relecture", () => {
    const error = new Stripe.errors.StripeInvalidRequestError({
      code: "payment_intent_unexpected_state",
      statusCode: 400,
    });
    expect(refusedWithoutState(error)).toBe(true);
  });

  it("un refus d'une autre nature ne se relit pas", () => {
    const error = new Stripe.errors.StripeInvalidRequestError({
      code: "resource_missing",
      statusCode: 404,
    });
    expect(refusedWithoutState(error)).toBe(false);
  });

  it("une erreur qui n'est pas de Stripe ne se relit pas", () => {
    expect(refusedWithoutState(new TypeError("x"))).toBe(false);
  });
});
