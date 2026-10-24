/**
 * E2E de la migration **`les_retraits_d_avant_s2_rattaches`** (décision de
 * Hugo du 2026-10-23, qui révise Q-S2), sur le vrai Postgres.
 *
 * L'état d'avant S2 est reproduit tel qu'il était : une commande de retrait
 * dont le snapshot porte les champs postaux et pas de `siteId`. Aucune
 * fabrique du domaine ne sait plus l'écrire — c'est précisément ce que S2 a
 * changé — d'où l'écriture Prisma directe. Exception gardée du plan T
 * (relue le 2026-10-25) : la donnée d'avant une migration est le sujet même
 * de la suite. Les numéros suivent le format réel (`ORD-<n>`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";
import { createCompany, createUser } from "./factories.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20261023200000_les_retraits_d_avant_s2_rattaches/migration.sql",
);
const ROLLBACK = `UPDATE "public"."orders"
   SET pickup_address = pickup_address - 'siteId' - 'siteIdBackfilled'
 WHERE pickup_address ? 'siteIdBackfilled'`;

const LABO = {
  label: "Labo du Port",
  ligne1: "1 quai du Four",
  ligne2: "",
  codePostal: "13002",
  ville: "Marseille",
  pays: "FR",
};

let ctx: E2eContext;
let seq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Le SQL de la migration — lu dans le fichier, jamais recopié. */
async function replay(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(readFileSync(MIGRATION, "utf8"));
}

async function createSite(fields: typeof LABO): Promise<string> {
  const site = await ctx.prisma.site.create({ data: fields });
  return site.id;
}

interface PickupSeed {
  readonly snapshot: Record<string, string>;
  readonly status: "placed" | "fulfilled";
  /** Jours avant aujourd'hui ; négatif = à venir. */
  readonly daysBefore: number;
}

async function seedPickup(seed: PickupSeed): Promise<string> {
  seq += 1;
  const company = await createCompany(ctx.prisma);
  const user = await createUser(ctx.prisma, { auth0Sub: `s2-${String(seq)}` });
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: `ORD-${String(seq)}`,
      companyId: company.id,
      placedByUserId: user.id,
      subtotalCents: 100,
      vatCents: 6,
      totalCents: 106,
      status: seed.status,
      requestedDeliveryDate: new Date(daysAgo(seed.daysBefore)),
      fulfillmentMethod: "pickup",
      pickupAddress: seed.snapshot,
    },
  });
  return order.id;
}

async function snapshotOf(id: string): Promise<unknown> {
  const order = await ctx.prisma.order.findUniqueOrThrow({
    where: { id },
    select: { pickupAddress: true },
  });
  return order.pickupAddress;
}

describe("les retraits d'avant S2 rattachés à leur site", () => {
  it("rattache une commande terminée à son site unique, avec le marqueur", async () => {
    const siteId = await createSite(LABO);
    const id = await seedPickup({
      snapshot: { ...LABO, ville: " Marseille " },
      status: "fulfilled",
      daysBefore: 20,
    });

    await replay();

    expect(await snapshotOf(id)).toEqual({
      ...LABO,
      ville: " Marseille ",
      siteId,
      siteIdBackfilled: true,
    });
  });

  it("laisse intacte une commande vivante à date future", async () => {
    await createSite(LABO);
    const id = await seedPickup({ snapshot: LABO, status: "placed", daysBefore: -5 });

    await replay();

    expect(await snapshotOf(id)).toEqual(LABO);
  });

  it("laisse intacte une commande dont deux sites sont identiques", async () => {
    await createSite(LABO);
    await createSite(LABO);
    const id = await seedPickup({ snapshot: LABO, status: "fulfilled", daysBefore: 20 });

    await replay();

    expect(await snapshotOf(id)).toEqual(LABO);
  });

  it("laisse intacte une commande au libellé vide", async () => {
    const blank = { ...LABO, label: "  " };
    await createSite(blank);
    const id = await seedPickup({ snapshot: blank, status: "fulfilled", daysBefore: 20 });

    await replay();

    expect(await snapshotOf(id)).toEqual(blank);
  });

  it("le retour arrière rend l'état d'origine", async () => {
    await createSite(LABO);
    const id = await seedPickup({ snapshot: LABO, status: "placed", daysBefore: 3 });

    await replay();
    expect(await snapshotOf(id)).toMatchObject({ siteIdBackfilled: true });
    await ctx.prisma.$executeRawUnsafe(ROLLBACK);

    expect(await snapshotOf(id)).toEqual(LABO);
  });
});
