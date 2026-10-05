/**
 * **La scène des e2e du scénario de développement** — ce que les suites
 * `dev-scenario*` partagent : la passerelle de paiement doublée, et les deux
 * mesures qui disent si un rechargement laisse quelque chose derrière lui.
 */
import type request from "supertest";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { CLIENT_RAISON_SOCIALE, DEFAULT_IDENTITY } from "../src/dev/seeding/client.seed.js";
import { admin } from "./delivery-rounds-scene.js";
import type { E2eContext, E2eOverride } from "./e2e-harness.js";
import { storageKeys } from "./storage.js";

let intentCount = 0;

/** Stripe, la seule frontière doublée en plus de la signature : le semis paie des commandes. */
export const PAYMENT_GATEWAY_OVERRIDE: E2eOverride = {
  token: PaymentGateway,
  value: {
    createIntent: () => {
      intentCount += 1;
      const id = `pi_e2e_dev_scenario_${String(intentCount)}`;
      return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
    },
    publishableKey: () => "pk_e2e",
    parseWebhook: () => ({ kind: "ignored" as const }),
    cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
  },
};

/**
 * Les schémas mesurés : tous ceux où le scénario écrit, ou où un abonné écrit
 * en réaction. `pim` n'y est pas — le scénario n'y écrit rien, et le catalogue
 * semé par le harnais y est stable par construction.
 */
const MEASURED_SCHEMAS = [
  "public",
  "growth",
  "ops",
  "platform",
  "production",
  "packing",
  "delivery",
];

/**
 * **Le nombre de lignes de chaque table**, lu au catalogue Postgres plutôt
 * qu'à une liste écrite ici : une table ajoutée demain est mesurée sans que
 * personne y pense — c'est elle qu'on aurait oubliée.
 */
export async function tableCounts(ctx: E2eContext): Promise<ReadonlyMap<string, number>> {
  const tables = await ctx.prisma.$queryRawUnsafe<{ schema: string; name: string }[]>(
    `SELECT table_schema AS schema, table_name AS name FROM information_schema.tables
      WHERE table_type = 'BASE TABLE' AND table_schema = ANY($1::text[])
        AND table_name <> '_prisma_migrations'
      ORDER BY 1, 2`,
    MEASURED_SCHEMAS,
  );
  const counts = new Map<string, number>();
  for (const { schema, name } of tables) {
    const [row] = await ctx.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM "${schema}"."${name}"`,
    );
    counts.set(`${schema}.${name}`, Number(row?.count ?? 0));
  }
  return counts;
}

/** Le nombre d'objets de chaque bucket que le scénario peut remplir. */
export async function bucketCounts(): Promise<ReadonlyMap<string, number>> {
  return new Map([
    ["bucket:customers", (await storageKeys("customers")).length],
    ["bucket:production", (await storageKeys("production")).length],
  ]);
}

/** Ce qui a grandi d'une mesure à l'autre, nommé : `schema.table (avant → après)`. */
export function grown(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): readonly string[] {
  return [...after].flatMap(([name, count]) => {
    const previous = before.get(name) ?? 0;
    return count > previous ? [`${name} (${String(previous)} → ${String(count)})`] : [];
  });
}

/** Un PDF lu jusqu'au bout : `supertest` ne bufferise pas un corps binaire de lui-même. */
async function fetchPdf(test: request.Test): Promise<void> {
  await test
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
}

/**
 * **Les trois papiers qu'une démo tire** sur la journée du scénario — le compte
 * à produire, une fiche d'atelier, un bon de commande —, pour que le stockage
 * ait quelque chose à rendre. Le scénario n'en écrit aucun lui-même : ils
 * naissent au premier téléchargement.
 */
export async function drawPapers(ctx: E2eContext, day: string): Promise<void> {
  const order = await ctx.prisma.order.findFirstOrThrow({
    where: {
      requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
      company: { raisonSociale: CLIENT_RAISON_SOCIALE },
      fulfillmentMethod: "pickup",
    },
    select: { id: true, orderNumber: true },
    orderBy: { orderNumber: "asc" },
  });
  await fetchPdf(admin(ctx).get(`/admin/production/batch/${day}/compte-a-produire.pdf`));
  await fetchPdf(admin(ctx).get(`/admin/production/batch/${day}/sheets/${order.orderNumber}.pdf`));
  await fetchPdf(ctx.asSub(DEFAULT_IDENTITY.auth0Sub).get(`/orders/${order.id}/bon.pdf`));
}
