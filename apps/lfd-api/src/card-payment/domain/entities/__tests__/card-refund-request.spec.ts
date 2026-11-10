import {
  CardRefundAlreadyIssuedError,
  CardRefundRequestInvalidError,
  CardRefundTransitionRefusedError,
} from "../../errors/card-refund-errors.js";
import {
  CARD_REFUND_REQUEST_STATES,
  type CardRefundRequestState,
  isCardRefundRequestTransition,
} from "../../value-objects/card-refund-values.js";
import { CardRefundRequest, type CardRefundRequestIntent } from "../card-refund-request.js";
import { AT, inState, intent, LATER } from "./card-refund-request-fixtures.js";

describe("CardRefundRequest — naître", () => {
  it("`now` : à émettre, génération 1, round 1, aucune tentative, échéance posée", () => {
    const { state, expected } = CardRefundRequest.request(intent()).toPersistence();

    expect(state).toMatchObject({
      state: "to_issue",
      generation: 1,
      round: 1,
      attempts: 0,
      providerRef: null,
      nextAttemptAt: AT,
    });
    expect(expected).toBeNull();
  });

  it("`button` (aucune échéance) : née ARRÊTÉE — elle attend le bouton (Q3)", () => {
    const request = CardRefundRequest.request(intent({ firstAttemptAt: null }));

    expect(request.current).toBe("stopped");
    expect(request.view.nextAttemptAt).toBeNull();
  });

  it.each<[string, Partial<CardRefundRequestIntent>]>([
    ["un montant annoncé nul", { announcedCents: 0 }],
    ["un montant annoncé non entier", { announcedCents: 12.5 }],
    ["une `amount` sans montant", { form: "amount", amountCents: null }],
    ["une `amount` à 0", { form: "amount", amountCents: 0 }],
    ["une `remainder` avec un montant", { amountCents: 500 }],
    ["un motif vide", { reason: "  " }],
    ["un motif de 65 caractères", { reason: "x".repeat(65) }],
  ])("refuse %s", (_, overrides) => {
    expect(() => CardRefundRequest.request(intent(overrides))).toThrow(
      CardRefundRequestInvalidError,
    );
  });

  it("la clé d'idempotence a UNE forme : `lfd-card-refund:<id>:<génération>:<round>` (§3.5, v14)", () => {
    expect(CardRefundRequest.request(intent()).key()).toBe("lfd-card-refund:req_1:1:1");
    expect(inState("to_issue", { generation: 3, round: 2 }).key()).toBe(
      "lfd-card-refund:req_1:3:2",
    );
  });
});

describe("CardRefundRequest — la machine (§3.4), la même que `refund_request_guard`", () => {
  const ADMITTED: readonly (readonly [CardRefundRequestState, CardRefundRequestState])[] = [
    ["to_issue", "issued"],
    ["to_issue", "refunded"],
    ["to_issue", "stopped"],
    ["issued", "refunded"],
    ["issued", "stopped"],
    ["stopped", "to_issue"],
    ["stopped", "refunded"],
    ["stopped", "settled_elsewhere"],
    ["refunded", "stopped"],
  ];

  it.each(
    CARD_REFUND_REQUEST_STATES.flatMap((from) =>
      CARD_REFUND_REQUEST_STATES.filter((to) => to !== from).map((to) => [from, to] as const),
    ),
  )("%s → %s : admise seulement si le déclencheur l'admet", (from, to) => {
    const admitted = ADMITTED.some(([a, b]) => a === from && b === to);

    expect(isCardRefundRequestTransition(from, to)).toBe(admitted);
  });

  it("`settled_elsewhere` est terminal", () => {
    expect(
      CARD_REFUND_REQUEST_STATES.some((to) =>
        isCardRefundRequestTransition("settled_elsewhere", to),
      ),
    ).toBe(false);
  });
});

describe("CardRefundRequest — l'émission", () => {
  it.each<[string, "pending" | "succeeded" | "failed", CardRefundRequestState, string | null]>([
    ["en attente", "pending", "issued", null],
    ["réussie dès la création", "succeeded", "refunded", null],
    ["morte dès la création", "failed", "stopped", "refund_failed"],
  ])("émise %s → %s", (_, status, target, failure) => {
    const request = inState("to_issue");

    const effect = request.acceptIssuance("re_1", 2_340, status, AT, AT);

    expect(effect).toEqual({ changed: true, stopped: failure });
    expect(request.view).toMatchObject({
      state: target,
      providerRef: "re_1",
      issuedAt: AT,
      issuedCents: 2_340,
      attempts: 1,
      lastFailure: failure,
      nextAttemptAt: null,
    });
  });

  it("le constat arrivé AVANT l'exécuteur pose le `re_…` sans compter d'essai ; l'exécuteur ne change plus rien", () => {
    const request = inState("to_issue");

    request.acceptIssuance("re_1", 2_340, "pending", null, AT);
    const executor = request.acceptIssuance("re_1", 2_340, "pending", LATER, LATER);

    expect(request.view).toMatchObject({ state: "issued", attempts: 0, issuedAt: AT });
    expect(executor).toEqual({ changed: false, stopped: null });
  });

  it("une `issued` qui réussit passe `refunded` ; jamais de recul vers `issued`", () => {
    const request = inState("issued", { providerRef: "re_1", issuedAt: AT });

    expect(request.acceptIssuance("re_1", 2_340, "succeeded", null, LATER).changed).toBe(true);
    expect(request.current).toBe("refunded");
    expect(request.acceptIssuance("re_1", 2_340, "pending", null, LATER).changed).toBe(false);
    expect(request.current).toBe("refunded");
  });

  it("une `amount` émise pour un AUTRE montant s'arrête (§3.5) : `issued_amount_mismatch`", () => {
    const request = CardRefundRequest.request(
      intent({ form: "amount", amountCents: 500, announcedCents: 500 }),
    );

    const effect = request.acceptIssuance("re_1", 400, "pending", AT, AT);

    expect(effect.stopped).toBe("issued_amount_mismatch");
    expect(request.current).toBe("stopped");
  });

  it("un AUTRE `re_…` que celui posé lève", () => {
    const request = inState("issued", { providerRef: "re_1", issuedAt: AT });

    expect(() => request.acceptIssuance("re_2", 2_340, "pending", null, AT)).toThrow(
      CardRefundAlreadyIssuedError,
    );
  });

  it("`unavailable` : un essai et un round de plus, l'échéance reportée ; vrai au PREMIER échec seulement", () => {
    const request = inState("to_issue");

    expect(request.unavailable(AT, LATER)).toBe(true);
    expect(request.unavailable(AT, LATER)).toBe(false);
    expect(request.view).toMatchObject({
      attempts: 2,
      round: 3,
      lastFailure: "unavailable",
      nextAttemptAt: LATER,
    });
    expect(request.key()).toBe("lfd-card-refund:req_1:1:3");
  });

  it("`unavailable` hors de `to_issue` est refusé", () => {
    expect(() => inState("issued").unavailable(AT, LATER)).toThrow(
      CardRefundTransitionRefusedError,
    );
  });

  it("`stop` : plus d'échéance, le code de l'échec gardé brut", () => {
    const request = inState("to_issue");

    request.stop("declined:expired_card", AT);

    expect(request.view).toMatchObject({
      state: "stopped",
      lastFailure: "declined:expired_card",
      nextAttemptAt: null,
      attempts: 1,
    });
  });
});
