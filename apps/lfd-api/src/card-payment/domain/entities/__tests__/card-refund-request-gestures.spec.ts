import {
  CardRefundNotStoppedError,
  CardRefundRequestInvalidError,
  CardRefundRetryRefusedError,
  CardRefundTransitionRefusedError,
} from "../../errors/card-refund-errors.js";
import type { CardRefundRequestState } from "../../value-objects/card-refund-values.js";
import { CardRefundRequest } from "../card-refund-request.js";
import { AT, inState, intent, LATER, thrownBy } from "./card-refund-request-fixtures.js";

describe("CardRefundRequest — le reste, l'inversion, le rendu autrement", () => {
  it.each<[CardRefundRequestState, boolean]>([
    ["to_issue", true],
    ["stopped", true],
    ["issued", false],
    ["refunded", false],
  ])("une `remainder` %s d'un paiement sans reste est rendue : %p", (state, settles) => {
    const request = inState(state);

    expect(request.settleWithoutRemainder()).toBe(settles);
    expect(request.current).toBe(settles ? "refunded" : state);
  });

  it("une `amount` ne se rend jamais « sans reste » : son montant est le sien", () => {
    const request = CardRefundRequest.request(
      intent({ form: "amount", amountCents: 500, announcedCents: 500 }),
    );

    expect(request.settleWithoutRemainder()).toBe(false);
  });

  it("`reverse` : `refunded → stopped`, échec `reversed` ; refusé depuis tout autre état", () => {
    const request = inState("refunded", { providerRef: "re_1", issuedAt: AT });

    request.reverse();

    expect(request.view).toMatchObject({ state: "stopped", lastFailure: "reversed" });
    expect(() => inState("issued").reverse()).toThrow(CardRefundTransitionRefusedError);
  });

  it("« rendu autrement » : une `stopped` devient `settled_elsewhere`, motif et fiche posés", () => {
    const request = inState("stopped");

    request.settleElsewhere("staff_1", "  Virement fait le 3  ");

    expect(request.view).toMatchObject({
      state: "settled_elsewhere",
      settledByStaffId: "staff_1",
      settledReason: "Virement fait le 3",
    });
  });

  it.each<CardRefundRequestState>(["to_issue", "issued", "refunded", "settled_elsewhere"])(
    "« rendu autrement » refusé sur une demande %s",
    (state) => {
      expect(() => inState(state).settleElsewhere("staff_1", "x")).toThrow(
        CardRefundNotStoppedError,
      );
    },
  );

  it.each(["", "   ", "x".repeat(501)])("« rendu autrement » refusé pour le motif %p", (reason) => {
    expect(() => inState("stopped").settleElsewhere("staff_1", reason)).toThrow(
      CardRefundRequestInvalidError,
    );
  });
});

describe("CardRefundRequest — « Relancer » (§3.4, v13, v14)", () => {
  it("une `stopped` repart : génération + 1, round 1, essais 0, `re_…` effacé, échéance maintenant", () => {
    const request = inState("stopped", {
      providerRef: "re_1",
      issuedAt: AT,
      issuedCents: 2_340,
      attempts: 2,
      round: 3,
      lastFailure: "refund_failed",
    });

    request.retry(LATER, false);

    expect(request.view).toMatchObject({
      state: "to_issue",
      generation: 2,
      round: 1,
      attempts: 0,
      providerRef: null,
      issuedAt: null,
      issuedCents: null,
      nextAttemptAt: LATER,
    });
  });

  it("une `to_issue` déjà tentée repart tout de suite, MÊME génération", () => {
    const request = inState("to_issue", { attempts: 1, nextAttemptAt: LATER });

    request.retry(AT, false);

    expect(request.view).toMatchObject({ state: "to_issue", generation: 1, nextAttemptAt: AT });
  });

  it.each<[string, CardRefundRequest, boolean, string]>([
    ["émise", inState("issued"), false, "awaiting_bank"],
    ["rendue", inState("refunded"), false, "refunded"],
    ["rendue autrement", inState("settled_elsewhere"), false, "settled_elsewhere"],
    ["jamais tentée", inState("to_issue"), false, "never_attempted"],
    ["sous bail", inState("to_issue", { attempts: 1, claimedUntil: LATER }), false, "in_progress"],
    ["arrêtée, une autre `remainder` en cours", inState("stopped"), true, "another_in_progress"],
  ])("refusée %s — et `retryable` le dit", (_, request, another, reason) => {
    expect(request.retryable(AT, another)).toBe(false);
    const refused = thrownBy(() => request.retry(AT, another));
    expect(refused).toBeInstanceOf(CardRefundRetryRefusedError);
    expect(refused).toMatchObject({ reason });
  });

  it("une `amount` arrêtée se relance même si une `remainder` est en cours", () => {
    const request = CardRefundRequest.rehydrate({
      ...inState("stopped").view,
      form: "amount",
      amountCents: 500,
    });

    expect(request.retryable(AT, true)).toBe(true);
  });

  it("un bail ÉCHU ne retient plus « Relancer »", () => {
    const request = inState("to_issue", { attempts: 1, claimedUntil: AT });

    expect(request.retryable(LATER, false)).toBe(true);
  });
});
