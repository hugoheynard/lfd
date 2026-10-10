import type { WebVitalSample } from "@lfd/ops-contract";

import { sendVitals, type VitalsFetch } from "../vitals-sender.js";

const SAMPLE: WebVitalSample = { front: "boutique", metric: "LCP", value: 1234 };
const ENDPOINT = "https://api.test/ops/vitals";

function recorder(result: Promise<unknown> = Promise.resolve()): {
  readonly calls: { readonly input: string; readonly init: RequestInit }[];
  readonly send: VitalsFetch;
} {
  const calls: { input: string; init: RequestInit }[] = [];
  return {
    calls,
    send: (input, init) => {
      calls.push({ input, init });
      return result;
    },
  };
}

describe("sendVitals — l'envoi des web vitals", () => {
  /**
   * Régression : `sendBeacon` partait en `credentials: include`, le CORS de
   * l'API le refusait, et `/health` comptait zéro mesure depuis le premier
   * jour (todo-vitals-refuses-par-le-cors.md, 2026-09-09 → corrigé 2026-10-10).
   */
  it("n'envoie aucun identifiant, et survit à la fermeture de l'onglet", () => {
    const { calls, send } = recorder();
    sendVitals(ENDPOINT, [SAMPLE], send);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe(ENDPOINT);
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      keepalive: true,
      credentials: "omit",
      headers: { "content-type": "application/json" },
    });
  });

  it("envoie les mesures en un seul corps JSON", () => {
    const { calls, send } = recorder();
    sendVitals(ENDPOINT, [SAMPLE, { ...SAMPLE, metric: "CLS", value: 0.1 }], send);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      samples: [SAMPLE, { ...SAMPLE, metric: "CLS", value: 0.1 }],
    });
  });

  it("n'envoie rien quand il n'y a rien à dire", () => {
    const { calls, send } = recorder();
    sendVitals(ENDPOINT, [], send);
    expect(calls).toHaveLength(0);
  });

  it("avale un échec : une mesure perdue n'est pas une erreur dans la page", async () => {
    const { send } = recorder(Promise.reject(new Error("réseau")));
    expect(() => sendVitals(ENDPOINT, [SAMPLE], send)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
