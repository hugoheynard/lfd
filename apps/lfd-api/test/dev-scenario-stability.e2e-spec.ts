/**
 * E2E de **la remise à l'état de base qui ne laisse rien derrière elle** —
 * `documentation/order/plan-jeu-de-donnees-par-etapes.md` §2 bis (Hugo,
 * 2026-10-05 : « surtout être organisé sur le reset, pour éviter de saturer le
 * Docker »).
 *
 * Mesuré avant ce lot, le même jour : chaque « Recharger les commandes »
 * laissait derrière lui ~1 200 lignes de `packing.day_change`, ~190 du journal
 * d'activité, 35 clés de passation, 52 courriers journalisés, 21 faits
 * d'outbox, les alertes et notifications de ses commandes — onze tables qui ne
 * faisaient que grandir.
 *
 * Le plan demande vingt tours ; la suite en fait **cinq**, et le dit : un tour
 * coûte une dizaine de secondes, et une croissance se voit dès le deuxième.
 * Chaque tour joue tout ce que l'écran peut jouer — remise, cinq étapes, rechargement
 * des commandes — et tire les trois papiers d'une démo, pour que le stockage ait
 * quelque chose à rendre.
 */
import type { DevScenarioResetReport } from "@lfd/contracts";

import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import { seedDriverRole } from "./delivery-driver-scene.js";
import {
  bucketCounts,
  drawPapers,
  grown,
  PAYMENT_GATEWAY_OVERRIDE,
  tableCounts,
} from "./dev-scenario-scene.js";

const SCENARIO = "/admin/dev/scenario";
/** Cinq tours : cf. l'en-tête. */
const ROUNDS = 5;
/** La dernière étape du scénario : « tournées chargées, prêtes à partir ». */
const LAST_STEP = 5;
const TIMEOUT_MS = 600_000;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE, PAYMENT_GATEWAY_OVERRIDE] });
  await ctx.reset();
  await seedDriverRole(ctx);
  await admin(ctx).post("/admin/dev/seed/reload").expect(200);
  await ctx.drain();
  // Même délai que le tour : le rechargement complet passe les 30 s par défaut
  // à la racine (constaté le 2026-10-05).
}, TIMEOUT_MS);

afterAll(async () => {
  await ctx.close();
});

/** Un tour de démo : remise, les cinq étapes, papiers, puis tout le scénario rechargé. */
async function playRound(): Promise<void> {
  const { day } = jsonBody<DevScenarioResetReport>(
    await admin(ctx).post(`${SCENARIO}/reset`).expect(200),
  );
  await ctx.drain();
  for (let step = 1; step <= LAST_STEP; step += 1) {
    await admin(ctx).post(`${SCENARIO}/next`).expect(200);
    await ctx.drain();
    // Le plan arrêté : ses papiers existent dès lors.
    if (step === 1) {
      await drawPapers(ctx, day);
    }
  }
  await admin(ctx).post("/admin/dev/seed/reload/orders").expect(200);
  await ctx.drain();
  await drawPapers(ctx, day);
}

async function measure(): Promise<ReadonlyMap<string, number>> {
  return new Map([...(await tableCounts(ctx)), ...(await bucketCounts())]);
}

describe("la remise à l'état de base, rejouée", () => {
  it(
    `laisse le nombre de lignes de chaque table et d'objets de chaque bucket stable sur ${String(ROUNDS)} tours`,
    async () => {
      await playRound();
      const baseline = await measure();
      // Le tour de référence a bien rempli le stockage : sinon la mesure des
      // buckets ne prouverait rien.
      expect(baseline.get("bucket:production")).toBeGreaterThan(0);
      expect(baseline.get("bucket:customers")).toBeGreaterThan(0);
      let previous = baseline;
      for (let round = 2; round <= ROUNDS; round += 1) {
        await playRound();
        const current = await measure();
        expect({ round, grown: grown(previous, current) }).toEqual({ round, grown: [] });
        previous = current;
      }
      expect(grown(baseline, previous)).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
