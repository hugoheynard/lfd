import type { CatalogSnapshot, SyncOperation } from "@lfd/catalog-sync";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { deliverAsFacts } from "./catalog-facts-delivery.js";
import { snapshotOf } from "./catalog-ingest-fixtures.js";
import { bootstrapE2e, daysAgo, serviceDay, type E2eContext } from "./e2e-harness.js";
import { prepareAtCommerce } from "./operations-at-commerce-seed.js";

/**
 * **La surcharge des opérations reçues, sa route et son mur** (lot 2 de
 * `documentation/operations-datees/architecture-operations-datees.md`).
 *
 * Ce qu'elle éprouvait d'autre — un envoi v11 qui écrit le miroir des
 * opérations, un envoi suivant qui les marque retirées, un envoi v10 resté en
 * file, l'effet de la surcharge sur une COPIE — n'existe plus depuis X1
 * (2026-10-17, `plan-sans-interrupteurs.md`) : un push n'apporte plus
 * d'opération, et une opération écrite au commerce ignore la surcharge. Ce
 * qui reste part avec la surcharge (Q5, X2).
 */

/** Le jeton porteur EST le `sub` : plusieurs personnes dans une même suite. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const OPERATIONS = "/admin/catalog/operations";

/** Deux rôles non-admin : l'un lit le catalogue vendu sans l'écrire, l'autre n'y a aucun droit. */
const ACCOUNTANT = { sub: "staff-comptable", role: "comptabilite", id: "fiche-comptable" } as const;
const COMMUNICATION = {
  sub: "staff-communication",
  role: "communication",
  id: "fiche-communication",
} as const;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  for (const person of [ACCOUNTANT, COMMUNICATION]) {
    await ctx.prisma.staffUser.create({
      data: {
        id: person.id,
        firstName: "Fiche",
        lastName: person.role,
        email: `${person.role}@lfc.test`,
        role: person.role,
        status: "active",
        auth0Id: person.sub,
      },
    });
  }
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub("staff-e2e");

/**
 * Noël, RELATIF à maintenant : annoncé dans un mois, clos dans onze semaines,
 * retiré la semaine d'après. Rien ici ne compare ces dates à l'horloge — le
 * lot 2 n'a pas d'état —, mais le lot 3 le fera, et la fixture ne doit pas
 * devenir une bombe à retardement ce jour-là.
 */
const ANNOUNCE_FROM = daysAgo(-30);
const ORDER_UNTIL = daysAgo(-77);
const PICKUP_FROM = serviceDay(78);
const PICKUP_UNTIL = serviceDay(84);

function noel(over: Partial<SyncOperation> = {}): SyncOperation {
  return {
    key: "noel-2026",
    name: { fr: "Noël", en: "Christmas" },
    lede: { fr: "La bûche revient" },
    image: null,
    announceFrom: ANNOUNCE_FROM,
    orderFrom: null,
    orderUntil: ORDER_UNTIL,
    pickupFrom: PICKUP_FROM,
    pickupUntil: PICKUP_UNTIL,
    audience: "both",
    skus: ["PAT-002-1", "VIE-001-1"],
    ...over,
  };
}

/** Le croissant courant, la bûche réservée aux opérations — et les opérations données. */
function v11(operations: readonly SyncOperation[]): CatalogSnapshot {
  return snapshotOf(
    [
      { sku: "VIE-001", priceMillicents: 210_000 },
      { sku: "PAT-002", priceMillicents: 2_900_000, operationOnly: true },
    ],
    [],
    operations,
  );
}

/**
 * Le croissant et la bûche, livrés en faits ; Noël, écrit AU COMMERCE — le
 * seul chemin depuis X1 (2026-10-17, `plan-sans-interrupteurs.md`).
 */
async function seedNoel(): Promise<void> {
  await deliverAsFacts(ctx, v11([]));
  await prepareAtCommerce(ctx, noel());
}

const restrict = (body: Record<string, unknown>, key = "noel-2026") =>
  staff()
    .put(`${OPERATIONS}/${key}/override`)
    .send({ isHidden: false, orderUntil: null, audience: null, hiddenSkus: [], ...body });

describe("la route de la surcharge (D9), jusqu'à son retrait (X2)", () => {
  beforeEach(async () => {
    await seedNoel();
  });

  it("refuse une opération jamais reçue — 404", async () => {
    await restrict({}, "paques-2027").expect(404);
  });

  it("refuse une forme fausse — 400, et rien n'est écrit", async () => {
    await restrict({ hiddenSkus: ["PAT-002-1", "PAT-002-1"] }).expect(400);
    await restrict({ audience: "tout-le-monde" }).expect(400);

    expect(await ctx.prisma.catalogOperationOverride.count()).toBe(0);
  });
});

describe("le mur d'accès — le droit du catalogue vendu", () => {
  beforeEach(async () => {
    await seedNoel();
  });

  it("ouvre la lecture à qui lit le catalogue vendu, et lui ferme l'écriture", async () => {
    await ctx.asSub(ACCOUNTANT.sub).get(OPERATIONS).expect(200);
    await ctx
      .asSub(ACCOUNTANT.sub)
      .put(`${OPERATIONS}/noel-2026/override`)
      .send({ isHidden: true, orderUntil: null, audience: null, hiddenSkus: [] })
      .expect(403);

    expect(await ctx.prisma.catalogOperationOverride.count()).toBe(0);
  });

  it("ferme tout à qui n'a aucun droit sur le catalogue vendu", async () => {
    await ctx.asSub(COMMUNICATION.sub).get(OPERATIONS).expect(403);
  });

  it("refuse sans jeton", async () => {
    await ctx.http().get(OPERATIONS).expect(401);
  });
});
