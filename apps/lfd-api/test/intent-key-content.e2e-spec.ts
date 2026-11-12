/**
 * E2E : **une clé d'intention ne vaut que pour son contenu**, et deux appels
 * simultanés sous la même clé n'écrivent qu'une fois (plan
 * `documentation/ops/plan-idempotence-des-ecritures.md`, § 7).
 *
 * Le rejeu séquentiel est éprouvé route par route par `write-replay`. Ce qui
 * ne s'y voit pas, et ne se voit que sur le vrai Postgres :
 *
 * - deux requêtes parties ensemble avec la même clé : l'index unique du
 *   registre arbitre, une seule écriture ; l'autre reçoit le refus « en vol »
 *   ou la réponse scellée ;
 * - la même clé renvoyée avec un AUTRE contenu : refus 409
 *   `intent.key_reused`, rien d'écrit — le sujet de l'intention porte
 *   l'empreinte du contenu (`intentSubject`).
 *
 * Deux gestes : le virement reçu (l'argent) et l'ajout d'un véhicule (une
 * création simple). Les requêtes sont celles des scénarios du rejeu.
 */
import type request from "supertest";

import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { REPLAY_OVERRIDES, clock } from "./write-replay/doubles.js";
import { REPLAY_SCENARIOS } from "./write-replay/replay-scenarios.js";
import { routeKey, type ReplayRequest } from "./write-replay/scenario.js";

const RECORD_TRANSFER = routeKey(
  "lafoliecoffee/accounting/http/admin-bank-transfers.controller.ts",
  "record",
);
const ADD_VEHICLE = routeKey("delivery/http/vehicles.controller.ts", "add");

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: REPLAY_OVERRIDES });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  clock.set(new Date());
  await ctx.reset();
});

async function prepared(route: string): Promise<ReplayRequest & { readonly body: object }> {
  const scenario = REPLAY_SCENARIOS[route];
  if (scenario === undefined) throw new Error(`e2e : pas de scénario pour ${route}`);
  const prepared = await scenario({ ctx, clock });
  await ctx.drain();
  if (prepared.sub === null || prepared.body === undefined) {
    throw new Error(`e2e : le scénario ${route} n'est pas un POST JSON d'un appelant connu`);
  }
  return { ...prepared, body: prepared.body };
}

function post(req: ReplayRequest, body: object, key: string): Promise<request.Response> {
  return ctx
    .asSub(req.sub ?? "")
    .post(req.path)
    .set(INTENT_KEY, key)
    .send(body)
    .then((response) => response);
}

const codeOf = (response: request.Response): string => jsonBody<{ code: string }>(response).code;

/** Les deux issues admises du second de deux appels simultanés. */
function expectOneWinner(responses: readonly request.Response[]): void {
  const succeeded = responses.filter((response) => response.status < 300);
  expect(succeeded.length).toBeGreaterThanOrEqual(1);
  for (const response of responses) {
    if (response.status >= 300) {
      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe("intent.in_flight");
    } else {
      expect(response.body).toEqual(succeeded[0]?.body);
    }
  }
}

describe("le virement reçu — une clé, un contenu", () => {
  /**
   * Régression : le sujet n'était que l'entité ; un virement dont la réponse
   * s'était perdue, renvoyé avec un montant corrigé sous la même clé,
   * affichait un succès et le montant corrigé n'était jamais écrit.
   */
  it("même clé, montant corrigé : 409 intent.key_reused, rien d'écrit", async () => {
    const req = await prepared(RECORD_TRANSFER);
    const key = freshIntent();
    const first = await post(req, req.body, key);
    expect(first.status).toBeLessThan(300);
    const corrected = { ...req.body, amountCents: 1 };

    const second = await post(req, corrected, key);

    expect(second.status).toBe(409);
    expect(codeOf(second)).toBe("intent.key_reused");
    expect(await ctx.prisma.receivedBankTransfer.count()).toBe(1);
  });

  it("deux envois simultanés, même clé : un seul virement enregistré", async () => {
    const req = await prepared(RECORD_TRANSFER);
    const key = freshIntent();

    const responses = await Promise.all([post(req, req.body, key), post(req, req.body, key)]);
    await ctx.drain();

    expectOneWinner(responses);
    expect(await ctx.prisma.receivedBankTransfer.count()).toBe(1);
  });
});

describe("l'ajout d'un véhicule — une clé, un contenu", () => {
  /**
   * Régression : le sujet d'une création était `"new"` ; la même clé
   * renvoyée avec une autre immatriculation rendait le véhicule d'avant.
   */
  it("même clé, autre immatriculation : 409 intent.key_reused, rien d'écrit", async () => {
    const req = await prepared(ADD_VEHICLE);
    const key = freshIntent();
    const first = await post(req, req.body, key);
    expect(first.status).toBeLessThan(300);

    const second = await post(req, { ...req.body, plate: "ZZ-999-ZZ" }, key);

    expect(second.status).toBe(409);
    expect(codeOf(second)).toBe("intent.key_reused");
    expect(await ctx.prisma.deliveryVehicle.count()).toBe(1);
  });

  it("deux envois simultanés, même clé : un seul véhicule", async () => {
    const req = await prepared(ADD_VEHICLE);
    const key = freshIntent();

    const responses = await Promise.all([post(req, req.body, key), post(req, req.body, key)]);
    await ctx.drain();

    expectOneWinner(responses);
    expect(await ctx.prisma.deliveryVehicle.count()).toBe(1);
  });
});
