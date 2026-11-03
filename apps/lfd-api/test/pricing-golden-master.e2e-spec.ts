/**
 * 🔴 **Le golden master du chiffrage** — lot L0 du plan
 * `documentation/pricing/centime-et-tva/plan-un-seul-assemblage.md` (§3, §4).
 *
 * Il FIGE le comportement d'aujourd'hui, sans rien juger : pour chaque panier
 * d'un corpus tiré à graine fixe, la sortie de CHAQUE chemin de chiffrage
 * (devis boutique anonyme et connecté, devis du client et du simulateur,
 * estimation de la saisie, passations, révision en deux temps) est comparée
 * au centime à un instantané versionné. Les refus se comparent par CODE. Les
 * lots L1+ doivent garder ce fichier vert sans toucher à l'instantané, sauf
 * écart tranché par Hugo et inscrit.
 *
 * 🔴 **Régénérer** : `LFD_GOLDEN_MASTER_WRITE=1` (lue par `test/setup-env.ts`,
 * jamais posée par défaut ni en CI) RÉÉCRIT l'instantané au lieu de le
 * comparer. Le diff se relit ligne à ligne avant d'être commité : chaque
 * ligne changée est un montant facturé autrement.
 *
 * ```bash
 * LFD_GOLDEN_MASTER_WRITE=1 pnpm --filter lfd-api exec jest -c jest.e2e.cjs test/pricing-golden-master.e2e-spec.ts
 * ```
 *
 * L'horloge est figée sur un mercredi à 10 h (`pricing-golden-master-scene.ts`)
 * et toute fixture datée lui est relative. Doublés : la signature des jetons
 * et Stripe.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { instantToLocal } from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { Clock } from "../src/platform/time/clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { GOLDEN_BASKETS, goldenCorpus, type GoldenBasket } from "./pricing-golden-master-corpus.js";
import { agentsFor } from "./pricing-golden-master-bodies.js";
import { recordBasket, type Paths } from "./pricing-golden-master-paths.js";
import { asObject } from "./pricing-golden-master-record.js";
import {
  arithmeticFaults,
  divergencesOf,
  gapCovering,
  KNOWN_GAPS,
  type Divergence,
} from "./pricing-golden-master-properties.js";
import { revisionDecisionCases } from "./pricing-golden-master-decisions.js";
import { lateFeeCase, refusalOrderCases } from "./pricing-golden-master-refusals.js";
import { GOLDEN_CLOCK, seedGoldenScene, type GoldenScene } from "./pricing-golden-master-scene.js";
import { GOLDEN_MASTER_WRITE } from "./setup-env.js";

const SNAPSHOT = join(process.cwd(), "test/pricing-golden-master.snapshot.json");

let intentSeq = 0;
const fakeGateway = {
  createIntent: () => {
    intentSeq += 1;
    const id = `pi_golden_${String(intentSeq)}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_golden",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

type Snapshot = Record<string, Paths>;

let ctx: E2eContext;
let scene: GoldenScene;
/** Tout ce que le run a enregistré, clé par clé — comparé à la fin. */
const recorded: Snapshot = {};
const met = new Set<string>();

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: Clock, value: GOLDEN_CLOCK },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
  await ctx.reset();
  scene = await seedGoldenScene(ctx);
}, 120_000);

afterAll(async () => {
  await ctx.close();
});

function ipOf(index: number): string {
  return `198.51.100.${String(10 + index)}`;
}

async function runBasket(basket: GoldenBasket, index: number): Promise<Divergence[]> {
  const { first, second } = await recordBasket({
    ctx,
    scene,
    basket,
    http: agentsFor(ctx, ipOf(index)),
  });
  recorded[basket.key] = first;
  // Même panier, même contexte → même résultat (G3) : la seconde passe des conseils.
  const replayed = Object.fromEntries(Object.keys(second).map((path) => [path, first[path]]));
  expect({ basket: basket.key, second }).toEqual({ basket: basket.key, second: replayed });
  const faults = Object.entries(first).flatMap(([path, out]) =>
    arithmeticFaults(`${basket.key} ${path}`, out),
  );
  expect(faults).toEqual([]);
  return divergencesOf(basket.key, first);
}

/** Clés triées sur deux niveaux (panier, chemin) : un instantané qui se relit en diff. */
function sorted(snapshot: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(snapshot)
      .sort()
      .map((key) => {
        const paths = asObject(snapshot[key]);
        return [
          key,
          Object.fromEntries(
            Object.keys(paths)
              .sort()
              .map((path) => [path, paths[path]]),
          ),
        ];
      }),
  );
}

describe("le golden master du chiffrage (L0)", () => {
  it(`${String(GOLDEN_BASKETS)} paniers : chaque chemin, deux passes, l'arithmétique, et les concordances d'aujourd'hui`, async () => {
    const unexplained: Divergence[] = [];
    for (const [index, basket] of goldenCorpus().entries()) {
      for (const divergence of await runBasket(basket, index)) {
        const gap = gapCovering(divergence);
        if (gap === undefined) unexplained.push(divergence);
        else met.add(gap.ecart);
      }
    }
    expect(unexplained).toEqual([]);
  }, 600_000);

  it("l'ordre des refus mesurable aujourd'hui (§2.4) — payeur, jour, chargement, heure limite", async () => {
    const cases = await refusalOrderCases(ctx, scene, agentsFor(ctx, ipOf(200)));
    recorded["refusal-order"] = cases.paths;
    for (const { first, over, label } of cases.orders) {
      expect({ label, code: cases.paths[first]?.code }).toEqual({
        label,
        code: cases.paths[over]?.code,
      });
    }
  }, 120_000);

  it("la dérogation à l'heure limite : le supplément, au conseil et à la passation", async () => {
    const paths = await lateFeeCase(ctx, scene, agentsFor(ctx, ipOf(201)));
    recorded["late-fee"] = paths;
    const faults = Object.entries(paths).flatMap(([path, out]) =>
      arithmeticFaults(`late-fee ${path}`, out),
    );
    expect(faults).toEqual([]);
    expect(paths["C.admin-orders.account"]?.amounts?.lateFeeCents).toBeGreaterThan(0);
    const divergences = divergencesOf("late-fee", paths);
    expect(divergences.filter((divergence) => gapCovering(divergence) === undefined)).toEqual([]);
    for (const divergence of divergences) met.add(gapCovering(divergence)?.ecart ?? "?");
    // Le supplément que le devis n'annonce pas (É11) doit se VOIR ici, sinon le cas ne prouve rien.
    expect(met.has("É11")).toBe(true);
  }, 120_000);

  it("les refus décidés de la révision (L1b) : É12, l'échéance inscrite ; É13, la clientèle de la commande", async () => {
    const paths = await revisionDecisionCases(ctx, scene, agentsFor(ctx, ipOf(202)));
    recorded["revision-decisions"] = paths;
    // É12 (Hugo, 2026-11-03) : l'équipe suit E1 en révision d'une commande pro.
    expect(paths["e12-unregistered-deadline.D.revision.staff"]?.code).toBe(
      "orders.fulfillment.deadline_not_registered",
    );
    // É13 (Hugo, 2026-11-03) : la clientèle figée garde le point réservé aux pros ouvert.
    expect(paths["e13-suspended-since.D.revision.staff"]?.status).toBe(200);
  }, 120_000);

  it("🔴 l'instantané : chaque montant et chaque code, au centime", () => {
    const day = instantToLocal(GOLDEN_CLOCK.now()).day;
    if (GOLDEN_MASTER_WRITE) {
      writeFileSync(SNAPSHOT, `${JSON.stringify(sorted(recorded), null, 2)}\n`);
      return;
    }
    // Relu par JSON des deux côtés : l'instantané n'a ni `undefined` ni `-0`.
    const parsed: unknown = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, "utf8")) : {};
    const run: unknown = JSON.parse(JSON.stringify(sorted(recorded)));
    expect({ ancre: day, run }).toEqual({ ancre: day, run: sorted(asObject(parsed)) });
    // Une exception que le corpus ne rencontre plus est un écart peut-être tranché : le dire.
    const unused = KNOWN_GAPS.filter((gap) => !met.has(gap.ecart)).map((gap) => gap.ecart);
    expect({ unusedGaps: unused }).toEqual({ unusedGaps: [] });
  });
});
