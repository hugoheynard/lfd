/**
 * TEMPORAIRE — l'opération après déploiement d'ORD-35 (commande au compte d'un restaurant
 * passée avant son marquage « maison ») en commande interne, par l'opération
 * `orders.ord-35-in-house`. Mesure : deux commandes identiques du même payeur, l'une au
 * compte (avant le marquage), l'autre interne (après), menées à la remise et
 * au solde ; puis l'opération appliquée à la première doit la rendre identique
 * à la seconde, hors identifiants, numéros et instants.
 */
import { InHouseConversion } from "../src/lafoliecoffee/orders/infrastructure/ord-35-in-house.operation.js";
import { PrismaService } from "../src/platform/database/prisma.service.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { backorderDecor, SKU, type BackorderDecor } from "./backorder-conversion-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, serviceDay, type E2eContext } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { handOver, placeOrder, type PlacedTestOrder } from "./order-factory.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;
let decor: BackorderDecor;

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
  decor = await backorderDecor(ctx);
});

async function markInHouse(): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put(`/admin/companies/${decor.companyId}/in-house`)
    .set(INTENT_KEY, freshIntent())
    .send({ inHouse: true })
    .expect(204);
}

function place(): Promise<PlacedTestOrder> {
  return placeOrder(ctx, {
    buyerUserId: decor.buyerId,
    companyId: decor.companyId,
    fulfillment: { method: "pickup", pickupSiteId: decor.pickupId },
    forDay: serviceDay(1),
    lines: [{ sku: SKU, quantity: 4 }],
  });
}

type Row = Record<string, unknown>;
const VOLATILE =
  /(^id$|_id$|^number$|order_number|_at$|^key$|^idempotency|intent|^reference|^trace|_token$|Token$|handoverUrl$)/;

/** Toutes les lignes, dans tous les schémas, qui portent l'id de la commande (ou de ses BL). */
async function dump(order: PlacedTestOrder): Promise<Record<string, Row[]>> {
  const tables = await ctx.prisma.$queryRawUnsafe<{ s: string; t: string; c: string }[]>(
    `SELECT table_schema s, table_name t, column_name c FROM information_schema.columns
      WHERE column_name IN ('order_id','note_id','delivery_note_id') AND table_schema NOT IN ('pg_catalog','information_schema')`,
  );
  const notes = await ctx.prisma.deliveryNote.findMany({
    where: { orderId: order.id },
    select: { id: true },
  });
  const ids = [order.id, ...notes.map((n) => n.id)];
  const out: Record<string, Row[]> = {};
  const orders = await ctx.prisma.$queryRawUnsafe<{ j: Row }[]>(
    `SELECT to_jsonb(o) j FROM public.orders o WHERE id = $1`,
    order.id,
  );
  out["public.orders"] = orders.map((r) => r.j);
  for (const { s, t, c } of tables) {
    const rows = await ctx.prisma.$queryRawUnsafe<{ j: Row }[]>(
      `SELECT to_jsonb(x) j FROM "${s}"."${t}" x WHERE "${c}" = ANY($1::text[])`,
      ids,
    );
    if (rows.length > 0) {
      out[`${s}.${t}`] = rows.map((r) => r.j);
    }
  }
  const outbox = await ctx.prisma.$queryRawUnsafe<{ j: Row }[]>(
    `SELECT jsonb_build_object('type', type, 'payload', payload) j FROM platform.outbox
      WHERE payload::text LIKE '%' || $1 || '%' ORDER BY type`,
    order.id,
  );
  out["outbox"] = outbox.map((r) => r.j);
  return out;
}

function normalize(value: unknown, a: PlacedTestOrder, b: PlacedTestOrder): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => normalize(v, a, b));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Row)
        .filter(([k]) => !VOLATILE.test(k))
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([k, v]) => [k, normalize(v, a, b)]),
    );
  }
  if (typeof value === "string") {
    return value
      .replaceAll(a.orderNumber, "ORD")
      .replaceAll(b.orderNumber, "ORD")
      .replaceAll(a.id, "OID")
      .replaceAll(b.id, "OID")
      .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "T");
  }
  return value;
}

function diff(x: unknown, y: unknown, path = ""): string[] {
  if (JSON.stringify(x) === JSON.stringify(y)) {
    return [];
  }
  if (x !== null && y !== null && typeof x === "object" && typeof y === "object") {
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    return [...keys].flatMap((k) => diff((x as Row)[k], (y as Row)[k], `${path}.${k}`));
  }
  return [`${path}: compte=${JSON.stringify(x)} interne=${JSON.stringify(y)}`];
}

/** La reprise, ciblée sur la commande donnée. */
function conversionFor(orderNumber: string): InHouseConversion {
  return new InHouseConversion(ctx.app.get(PrismaService), ctx.app.get(UnitOfWork), orderNumber);
}

const MEASURED = [
  ".outbox.1.payload.data.sheet.money.settlement",
  ".outbox.1.payload.data.sheet.money.totalCents",
  ".outbox.1.payload.data.sheet.money.vatCents",
  ".outbox.1.payload.data.sheet.money.vatShares.0",
  ".outbox.2.payload.billableTotalCents",
  ".public.delivery_note.0.total_cents",
  ".public.delivery_note.0.vat_cents",
  ".public.delivery_note.0.vat_shares.0",
  ".public.delivery_note_version.0.rendered.note.money.settlement",
  ".public.delivery_note_version.0.rendered.note.money.totalCents",
  ".public.delivery_note_version.0.rendered.note.money.vatCents",
  ".public.delivery_note_version.0.rendered.note.money.vatShares.0",
  ".public.orders.0.billable_total_cents",
  ".public.orders.0.billable_vat_cents",
  ".public.orders.0.billable_vat_shares.0",
  ".public.orders.0.offer_nature",
  ".public.orders.0.offer_note",
  ".public.orders.0.offer_notifies_customer",
  ".public.orders.0.offered_total_cents",
  ".public.orders.0.offered_vat_cents",
  ".public.orders.0.offered_vat_shares",
  ".public.orders.0.total_cents",
  ".public.orders.0.vat_cents",
  ".public.orders.0.vat_shares.0",
];

async function scene(handBefore: boolean): Promise<{ a: PlacedTestOrder; b: PlacedTestOrder }> {
  const a = await place();
  await markInHouse();
  const b = await place();
  if (handBefore) {
    await handOver(ctx, a);
    await handOver(ctx, b);
  }
  return { a, b };
}

it("mesure : ce qui diffère entre la commande au compte et l'interne, remises et soldées", async () => {
  const { a, b } = await scene(true);
  const paths = diff(normalize(await dump(a), a, b), normalize(await dump(b), a, b)).map((line) =>
    line.slice(0, line.indexOf(":")),
  );
  // Mesuré le 2026-11-26 : rien d'autre ne diffère (lignes, sous-total,
  // remises, frais, statut, payment_status compris).
  expect(paths).toEqual(MEASURED);
});

it.each([
  ["remises et soldées", true],
  ["avant la remise", false],
])(
  "l'opération rend la commande au compte identique à l'interne (%s)",
  async (_label: string, handBefore: boolean) => {
    const { a, b } = await scene(handBefore);
    expect(await conversionFor(a.orderNumber).apply()).toBe(true);
    if (!handBefore) {
      await handOver(ctx, a);
      await handOver(ctx, b);
    }
    const lines = diff(normalize(await dump(a), a, b), normalize(await dump(b), a, b)).filter(
      (l) => !l.startsWith(".outbox"),
    );
    expect(lines).toEqual([]);
  },
);

it("rejouable : à zéro après, avec la raison ; les gardes refusent un payeur non maison", async () => {
  const { a } = await scene(true);
  const conversion = conversionFor(a.orderNumber);
  expect(await conversion.refusal(false)).toBeNull();
  expect(await conversion.apply()).toBe(true);
  expect(await conversion.refusal(false)).toMatch(/déjà interne/);
  expect(await conversion.apply()).toBe(false);
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put(`/admin/companies/${decor.companyId}/in-house`)
    .set(INTENT_KEY, freshIntent())
    .send({ inHouse: false })
    .expect(204);
  const other = await place();
  expect(await conversionFor(other.orderNumber).refusal(false)).toMatch(/pas marqué « maison »/);
  expect(await conversionFor("ORD-INEXISTANTE").refusal(false)).toMatch(/n'existe pas/);
});
