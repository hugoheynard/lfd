import Stripe from "stripe";

import type { RefundParams } from "../../../domain/ports/card-provider-types.js";
import { REFUND_METADATA, StripeRefundCalls } from "../stripe-refund-calls.js";

/**
 * Les appels de remboursement (doc `documentation/commandes/annulation/annulation-par-le-staff.md`,
 * C4.7) devant un FAUX transport HTTP de Stripe : le vrai SDK, les vraies
 * requêtes, aucune sortie réseau. Les réponses sont écrites à la main.
 */

interface SeenRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly body: URLSearchParams;
  readonly headers: Readonly<Record<string, string>>;
}

type Reply = { readonly status: number; readonly body: unknown };

class FakeStripeHttp {
  readonly seen: SeenRequest[] = [];

  constructor(private readonly replies: Reply[]) {}

  readonly fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    this.seen.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      query: url.searchParams,
      body: new URLSearchParams(typeof init?.body === "string" ? init.body : ""),
      headers,
    });
    const reply = this.replies.shift() ?? { status: 500, body: { error: { type: "api_error" } } };
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { "content-type": "application/json", "request-id": "req_1" },
      }),
    );
  };
}

// Copié de `b2b/payments/infrastructure/__tests__/` le 2026-11-09 (plan M2,
// P0) : l'intention passe à part (`PI`), la recherche et la création restent.
const PI = "pi_1";

/** Une `remainder` : sans montant, la clé d'idempotence unique du §3.5 (v14). */
const PARAMS: RefundParams = {
  key: "lfd-card-refund:req_1:2:1",
  requestId: "req_1",
  generation: 2,
  subjectLabel: "order:ord_1",
  amountCents: null,
};

/** 2030-01-10T09:00:00Z, en secondes Unix — comparé à rien d'autre qu'à sa conversion. */
const CREATED = 1_894_266_000;

function refundObject(overrides: Record<string, unknown> = {}) {
  return {
    object: "refund",
    id: "re_1",
    amount: 2_340,
    currency: "eur",
    status: "pending",
    payment_intent: "pi_1",
    created: CREATED,
    metadata: {
      [REFUND_METADATA.request]: "req_1",
      [REFUND_METADATA.generation]: "2",
      [REFUND_METADATA.order]: "order:ord_1",
    },
    ...overrides,
  };
}

const list = (data: unknown[]): Reply => ({
  status: 200,
  body: { object: "list", data, has_more: false, url: "/v1/refunds" },
});

function callsWith(replies: Reply[]) {
  const http = new FakeStripeHttp(replies);
  const client = new Stripe("sk_test_faux", {
    httpClient: Stripe.createFetchHttpClient(http.fetch),
    maxNetworkRetries: 0,
  });
  return { http, calls: new StripeRefundCalls(client) };
}

describe("StripeRefundCalls.refund — chercher d'abord", () => {
  it("retient un re_… de la demande ET de la génération courante, sans rien créer", async () => {
    const { http, calls } = callsWith([list([refundObject()])]);

    await expect(calls.refund(PI, PARAMS)).resolves.toEqual({
      kind: "issued",
      refund: {
        refundId: "re_1",
        amountCents: 2_340,
        currency: "eur",
        status: "pending",
        createdAt: new Date(CREATED * 1000),
      },
    });
    expect(http.seen).toHaveLength(1);
    expect(http.seen[0]?.method).toBe("GET");
    expect(http.seen[0]?.query.get("payment_intent")).toBe("pi_1");
    expect(http.seen[0]?.query.get("limit")).toBe("100");
  });

  it.each([
    [
      "d'une génération précédente",
      refundObject({
        metadata: { [REFUND_METADATA.request]: "req_1", [REFUND_METADATA.generation]: "1" },
      }),
    ],
    ["échoué", refundObject({ status: "failed" })],
    ["annulé", refundObject({ status: "canceled" })],
    [
      "d'une autre demande",
      refundObject({
        metadata: { [REFUND_METADATA.request]: "ord_9", [REFUND_METADATA.generation]: "2" },
      }),
    ],
    ["sans métadonnée (tableau de bord)", refundObject({ metadata: {} })],
  ])("ignore un re_… %s et crée", async (_, ignored) => {
    const { http, calls } = callsWith([
      list([ignored]),
      { status: 200, body: refundObject({ id: "re_2" }) },
    ]);

    const issuance = await calls.refund(PI, PARAMS);

    expect(issuance).toMatchObject({ kind: "issued", refund: { refundId: "re_2" } });
    expect(http.seen.map((request) => request.method)).toEqual(["GET", "POST"]);
  });
});

describe("StripeRefundCalls.refund — créer", () => {
  it("sous la clé d'idempotence, SANS montant, avec les métadonnées de la demande", async () => {
    const { http, calls } = callsWith([list([]), { status: 200, body: refundObject() }]);

    await calls.refund(PI, PARAMS);

    const create = http.seen[1];
    expect(create?.path).toBe("/v1/refunds");
    expect(create?.headers["idempotency-key"]).toBe(PARAMS.key);
    expect(create?.body.get("payment_intent")).toBe("pi_1");
    expect(create?.body.has("amount")).toBe(false);
    expect(create?.body.get("reason")).toBe("requested_by_customer");
    expect(create?.body.get(`metadata[${REFUND_METADATA.request}]`)).toBe("req_1");
    expect(create?.body.get(`metadata[${REFUND_METADATA.generation}]`)).toBe("2");
    // P1 (§5.2) : le SUJET, plus l'identifiant de la demande — un ULID de demande
    // se lirait comme un numéro de commande chez Stripe.
    expect(create?.body.get(`metadata[${REFUND_METADATA.order}]`)).toBe("order:ord_1");
  });

  it("une `amount` porte SON montant (§3.5)", async () => {
    const { http, calls } = callsWith([list([]), { status: 200, body: refundObject() }]);

    await calls.refund(PI, { ...PARAMS, amountCents: 1_200 });

    expect(http.seen[1]?.body.get("amount")).toBe("1200");
  });

  it.each<[string, Reply, object]>([
    [
      "tout est déjà rendu",
      {
        status: 400,
        body: {
          error: { type: "invalid_request_error", code: "charge_already_refunded", message: "x" },
        },
      },
      { kind: "nothing_left" },
    ],
    [
      "la clé est en cours (409)",
      {
        status: 409,
        body: {
          error: { type: "invalid_request_error", code: "idempotency_key_in_use", message: "x" },
        },
      },
      { kind: "unavailable" },
    ],
    [
      "un conflit d'idempotence",
      { status: 400, body: { error: { type: "idempotency_error", message: "x" } } },
      { kind: "unavailable" },
    ],
    [
      "un litige",
      {
        status: 400,
        body: { error: { type: "invalid_request_error", code: "charge_disputed", message: "x" } },
      },
      { kind: "declined", code: "charge_disputed" },
    ],
    [
      "trop de requêtes (429)",
      { status: 429, body: { error: { type: "rate_limit_error", message: "x" } } },
      { kind: "unavailable" },
    ],
    [
      "une panne (500)",
      { status: 500, body: { error: { type: "api_error", message: "x" } } },
      { kind: "unavailable" },
    ],
  ])("traduit le refus « %s »", async (_, reply, expected) => {
    const { calls } = callsWith([list([]), reply]);

    await expect(calls.refund(PI, PARAMS)).resolves.toMatchObject(expected);
  });

  it("une recherche qui échoue — après les DEUX reprises par requête — ne crée rien : `unavailable`", async () => {
    const { http, calls } = callsWith([]);

    await expect(calls.refund(PI, PARAMS)).resolves.toMatchObject({ kind: "unavailable" });
    // Le client est construit SANS reprise : les deux viennent des options par requête (C4.7).
    expect(http.seen.map((request) => request.method)).toEqual(["GET", "GET", "GET"]);
  });
});

describe("StripeRefundCalls.findRefund", () => {
  it("rend `none` quand rien ne correspond", async () => {
    const { calls } = callsWith([list([refundObject({ status: "failed" })])]);

    await expect(calls.findRefund(PI, PARAMS)).resolves.toEqual({ kind: "none" });
  });
});
