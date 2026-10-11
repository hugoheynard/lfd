import { r2Reachable, resendReachable, stripeReachable } from "../external.probes.js";
import { probeHttp, type ReachableAnswer } from "../probe.port.js";

/**
 * Une clé restreinte n'est pas un service tombé. Régression du 2026-10-11 : la
 * carte disait Stripe « injoignable — accès refusé (403) » et Resend
 * « injoignable — accès refusé (401) » pendant que les paiements passaient et
 * que 29 e-mails partaient.
 */

const RESEND_RESTRICTED = JSON.stringify({
  statusCode: 401,
  message: "This API key is restricted to only send emails",
  name: "restricted_api_key",
});

const RESEND_INVALID = JSON.stringify({
  statusCode: 401,
  message: "API key is invalid",
  name: "validation_error",
});

function answer(status: number, body = ""): () => Promise<Response> {
  return () => Promise.resolve(new Response(body === "" ? null : body, { status }));
}

const probe = (request: () => Promise<Response>, reachable?: ReachableAnswer) =>
  probeHttp(request, Date.now(), reachable);

describe("Stripe — une clé restreinte répond 403", () => {
  it("🔴 tient Stripe pour joignable sur un 403 de clé restreinte", async () => {
    const outcome = await probe(answer(403, '{"error":{}}'), stripeReachable);

    expect(outcome).toMatchObject({
      verdict: "up",
      detail: "clé restreinte (lecture du solde refusée)",
    });
  });

  it("fait tomber Stripe sur un 401 : la clé est inconnue ou révoquée", async () => {
    const outcome = await probe(answer(401), stripeReachable);

    expect(outcome).toMatchObject({ verdict: "down", detail: "accès refusé (401)" });
  });
});

describe("Resend — une clé « envoi seulement » répond 401 nommé", () => {
  it("🔴 tient Resend pour joignable sur un 401 `restricted_api_key`", async () => {
    const outcome = await probe(answer(401, RESEND_RESTRICTED), resendReachable);

    expect(outcome).toMatchObject({ verdict: "up", detail: "clé restreinte (envoi seulement)" });
  });

  it("fait tomber Resend sur un 401 d'une autre nature : la clé est morte", async () => {
    const outcome = await probe(answer(401, RESEND_INVALID), resendReachable);

    expect(outcome).toMatchObject({ verdict: "down", detail: "accès refusé (401)" });
  });

  it("fait tomber Resend sur un 401 au corps illisible", async () => {
    const outcome = await probe(answer(401, "<html>"), resendReachable);

    expect(outcome.verdict).toBe("down");
  });

  it("ne reconnaît pas le nom de la clé restreinte sous un autre code", async () => {
    const outcome = await probe(answer(403, RESEND_RESTRICTED), resendReachable);

    expect(outcome).toMatchObject({ verdict: "down", detail: "accès refusé (403)" });
  });
});

describe("R2 — le domaine public des images", () => {
  it("tient le domaine pour servi sur un 404 : relié, sans objet à la racine", async () => {
    const outcome = await probe(answer(404), r2Reachable);

    expect(outcome).toMatchObject({ verdict: "up", detail: "domaine public servi" });
  });

  it("fait tomber R2 quand l'accès public est retiré", async () => {
    expect((await probe(answer(403), r2Reachable)).verdict).toBe("down");
  });
});

describe("probeHttp — ce que la reconnaissance ne couvre pas", () => {
  it("rend `up` sans détail sur un 2xx", async () => {
    expect(await probe(answer(200), stripeReachable)).toEqual({
      verdict: "up",
      latencyMs: expect.any(Number) as number,
    });
  });

  it("fait tomber sur un 5xx, reconnaissance ou pas", async () => {
    const outcome = await probe(answer(503), stripeReachable);

    expect(outcome).toMatchObject({ verdict: "down", detail: "réponse 503" });
  });

  it("fait tomber sur un délai dépassé : injoignable", async () => {
    const timeout = (): Promise<Response> =>
      Promise.reject(new DOMException("The operation was aborted.", "TimeoutError"));

    const outcome = await probe(timeout, resendReachable);

    expect(outcome).toMatchObject({ verdict: "down", detail: "injoignable" });
  });

  it("garde 401/403 tombés pour une sonde qui ne déclare rien", async () => {
    expect((await probe(answer(403))).verdict).toBe("down");
    expect((await probe(answer(401, RESEND_RESTRICTED))).verdict).toBe("down");
  });
});
