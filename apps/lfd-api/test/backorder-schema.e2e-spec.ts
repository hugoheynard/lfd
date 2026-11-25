import type { AdminPlacedOrderResponse } from "@lfd/contracts";

import { Backorder } from "../src/lafoliecoffee/orders/backorder/domain/entities/backorder.js";
import { BackorderRepository } from "../src/lafoliecoffee/orders/backorder/domain/ports/backorder.repository.js";
import { BackorderLine } from "../src/lafoliecoffee/orders/backorder/domain/value-objects/backorder-line.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { pickupSite } from "./order-factory.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

/**
 * E2E — **ce que la base tient du reliquat de commande et du port offert**
 * (`documentation/commandes/reliquat/reliquat.md`, § 6.1 ;
 * migration `20261125160000_le_reliquat_de_commande`).
 *
 * Ce que seul ce niveau prouve : l'adaptateur écrit et relit l'agrégat, et les
 * CHECK, UNIQUE et le déclencheur refusent ce qu'une écriture hors de
 * l'agrégat tenterait. Aucune passation n'écrit encore `delivery_offered` :
 * la ligne se fabrique en recopiant, en SQL, une vraie commande de l'équipe.
 */

const BUYER = "auth0|acheteur-reliquat";
const DAY = serviceDay(7);
const STAFF = "staff_reliquat";

let ctx: E2eContext;
let repository: BackorderRepository;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
  repository = ctx.app.get(BackorderRepository);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

interface PlacedOrder {
  readonly id: string;
  readonly companyId: string;
  readonly buyerUserId: string;
}

/** Une commande de l'équipe, en retrait, au compte. */
async function placedOrder(): Promise<PlacedOrder> {
  const pickupId = await pickupSite(ctx.prisma);
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  const order = jsonBody<AdminPlacedOrderResponse>(
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/orders")
      .set(INTENT_KEY, freshIntent())
      .send({
        companyId: company.id,
        buyerUserId: user.id,
        settlement: "account",
        requestedDeliveryDate: DAY,
        fulfillmentMethod: "pickup",
        pickupAddressId: pickupId,
        requestedWindow: { start: "07:00", end: "08:00" },
        note: "",
        lines: [{ sku: "VIE-001-1", quantity: 3 }],
      })
      .expect(201),
  );
  return { id: order.id, companyId: company.id, buyerUserId: user.id };
}

/** Une copie de la commande `sourceId`, ses colonnes remplacées par `columns`. */
async function copyOf(
  sourceId: string,
  suffix: string,
  columns: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const id = `ord_copy_${suffix}`;
  const overrides = JSON.stringify({
    id,
    order_number: `ORD-9${suffix}`,
    handover_token: `jeton-reliquat-${suffix}`,
    ...columns,
  });
  await ctx.prisma.$executeRaw`
    INSERT INTO "public"."orders"
    SELECT (jsonb_populate_record(NULL::"public"."orders", to_jsonb(o) || ${overrides}::jsonb)).*
      FROM "public"."orders" o
     WHERE o.id = ${sourceId}`;
  return id;
}

/** Un reliquat ouvert sur `origin`, par l'agrégat et l'adaptateur. */
async function openBackorder(origin: PlacedOrder, id = "bo_e2e"): Promise<Backorder> {
  const backorder = Backorder.open({
    id,
    originOrderId: origin.id,
    companyId: origin.companyId,
    buyerUserId: origin.buyerUserId,
    lines: [
      BackorderLine.of({ sku: "VIE-001-1", quantity: 2, saleUnit: "piece" }),
      BackorderLine.of({ sku: "PAI-010-1", quantity: 750, saleUnit: "weight" }),
    ],
    openedAt: new Date(daysAgo(1)),
  });
  await repository.save(backorder);
  return backorder;
}

/** Réécrit en SQL le reliquat `id` par la clause `set` — une écriture hors de l'agrégat. */
function rawUpdate(id: string, set: string): Promise<number> {
  return ctx.prisma.$executeRawUnsafe(`UPDATE "public"."backorder" SET ${set} WHERE "id" = $1`, id);
}

describe("le reliquat — l'adaptateur", () => {
  it("écrit puis relit le reliquat ouvert, lignes au poids comprises", async () => {
    const origin = await placedOrder();
    const written = await openBackorder(origin);

    const read = await repository.load(written.id);

    expect(read?.toSnapshot()).toEqual(written.toSnapshot());
    const row = await ctx.prisma.backorder.findUniqueOrThrow({ where: { id: written.id } });
    expect(row.lines).toEqual([
      { sku: "VIE-001-1", quantity: 2, sale_unit: "piece" },
      { sku: "PAI-010-1", quantity: 750, sale_unit: "weight" },
    ]);
  });

  it("réécrit le sort d'un reliquat transformé, sous verrou", async () => {
    const origin = await placedOrder();
    await openBackorder(origin);
    const converted = await copyOf(origin.id, "1");
    const closedAt = new Date(daysAgo(0));

    const locked = await repository.loadLocked("bo_e2e");
    if (locked === null) {
      throw new Error("le reliquat semé est introuvable");
    }
    locked.convert(converted, closedAt, STAFF);
    await repository.save(locked);

    expect((await repository.load("bo_e2e"))?.toSnapshot()).toMatchObject({
      state: "converted",
      convertedOrderId: converted,
      closedAt,
      closedByStaffId: STAFF,
    });
  });

  it("rend null pour un reliquat inconnu", async () => {
    expect(await repository.load("bo_inconnu")).toBeNull();
    expect(await repository.loadLocked("bo_inconnu")).toBeNull();
  });
});

describe("le reliquat — ce que la base refuse", () => {
  it("refuse un second reliquat sur la même commande d'origine (UNIQUE)", async () => {
    const origin = await placedOrder();
    await openBackorder(origin);

    await expect(openBackorder(origin, "bo_second")).rejects.toThrow(/origin_order_id/u);
  });

  it("refuse une même commande issue de deux reliquats (UNIQUE)", async () => {
    const origin = await placedOrder();
    const otherOrigin = await copyOf(origin.id, "2");
    const converted = await copyOf(origin.id, "3");
    await openBackorder(origin);
    await openBackorder({ ...origin, id: otherOrigin }, "bo_other");
    await rawUpdate(
      "bo_e2e",
      `"state" = 'converted', "converted_order_id" = '${converted}', "closed_at" = now(), "closed_by_staff_id" = '${STAFF}'`,
    );

    await expect(
      rawUpdate(
        "bo_other",
        `"state" = 'converted', "converted_order_id" = '${converted}', "closed_at" = now(), "closed_by_staff_id" = '${STAFF}'`,
      ),
    ).rejects.toThrow(/converted_order_id/u);
  });

  it("refuse un état inconnu", async () => {
    await openBackorder(await placedOrder());

    // Fermé avec son auteur : seul le CHECK de l'état peut refuser.
    await expect(
      rawUpdate(
        "bo_e2e",
        `"state" = 'to_redeliver', "closed_at" = now(), "closed_by_staff_id" = '${STAFF}'`,
      ),
    ).rejects.toThrow(/backorder_state_known/u);
  });

  it("refuse des lignes vides ou qui ne sont pas une liste", async () => {
    await openBackorder(await placedOrder());

    await expect(rawUpdate("bo_e2e", `"lines" = '[]'::jsonb`)).rejects.toThrow(
      /backorder_lines_array/u,
    );
    await expect(rawUpdate("bo_e2e", `"lines" = '{}'::jsonb`)).rejects.toThrow(
      /backorder_lines_array/u,
    );
  });

  it("refuse converted sans commande issue, et une commande issue sans converted", async () => {
    const origin = await placedOrder();
    const converted = await copyOf(origin.id, "4");
    await openBackorder(origin);

    await expect(
      rawUpdate(
        "bo_e2e",
        `"state" = 'converted', "closed_at" = now(), "closed_by_staff_id" = '${STAFF}'`,
      ),
    ).rejects.toThrow(/backorder_converted_order_iff_converted/u);
    await expect(
      rawUpdate(
        "bo_e2e",
        `"state" = 'abandoned', "converted_order_id" = '${converted}', "closed_at" = now(), "closed_by_staff_id" = '${STAFF}'`,
      ),
    ).rejects.toThrow(/backorder_converted_order_iff_converted/u);
  });

  it("refuse un reliquat fermé sans auteur ou sans instant, et un ouvert qui en porte", async () => {
    await openBackorder(await placedOrder());

    await expect(rawUpdate("bo_e2e", `"state" = 'abandoned', "closed_at" = now()`)).rejects.toThrow(
      /backorder_closed_iff_not_open/u,
    );
    await expect(
      rawUpdate("bo_e2e", `"state" = 'abandoned', "closed_by_staff_id" = '${STAFF}'`),
    ).rejects.toThrow(/backorder_closed_iff_not_open/u);
    await expect(rawUpdate("bo_e2e", `"closed_at" = now()`)).rejects.toThrow(
      /backorder_closed_iff_not_open/u,
    );
  });

  it("refuse la commande d'origine comme commande issue", async () => {
    const origin = await placedOrder();
    await openBackorder(origin);

    await expect(
      rawUpdate(
        "bo_e2e",
        `"state" = 'converted', "converted_order_id" = '${origin.id}', "closed_at" = now(), "closed_by_staff_id" = '${STAFF}'`,
      ),
    ).rejects.toThrow(/backorder_not_its_own_origin/u);
  });

  it("refuse une commande d'origine inconnue (clé étrangère)", async () => {
    const origin = await placedOrder();

    await expect(openBackorder({ ...origin, id: "ord_inconnue" })).rejects.toThrow(
      /origin_order_id_fkey|Foreign key/u,
    );
  });
});

describe("orders.delivery_offered — le port offert durable", () => {
  it("vaut false pour toute commande passée aujourd'hui", async () => {
    const origin = await placedOrder();

    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: origin.id },
      select: { deliveryOffered: true },
    });
    expect(row.deliveryOffered).toBe(false);
  });

  it("admet le drapeau à l'insertion avec un port nul", async () => {
    const origin = await placedOrder();

    const id = await copyOf(origin.id, "5", { delivery_offered: true, delivery_fee_cents: 0 });

    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { id },
      select: { deliveryOffered: true },
    });
    expect(row.deliveryOffered).toBe(true);
  });

  it("refuse le drapeau avec un frais HT", async () => {
    const origin = await placedOrder();

    await expect(
      copyOf(origin.id, "6", { delivery_offered: true, delivery_fee_cents: 500 }),
    ).rejects.toThrow(/orders_delivery_offered_waives_fee/u);
  });

  it("refuse le drapeau avec un frais TTC", async () => {
    const origin = await placedOrder();

    await expect(
      copyOf(origin.id, "7", {
        delivery_offered: true,
        delivery_fee_cents: 0,
        delivery_fee_ttc_cents: 600,
      }),
    ).rejects.toThrow(/orders_delivery_offered_waives_fee/u);
  });

  it("refuse de poser le drapeau après la passation", async () => {
    const origin = await placedOrder();

    await expect(
      ctx.prisma.order.update({ where: { id: origin.id }, data: { deliveryOffered: true } }),
    ).rejects.toThrow(/figé à la passation/u);
  });

  it("refuse de retirer le drapeau d'une commande qui le porte", async () => {
    const origin = await placedOrder();
    const id = await copyOf(origin.id, "8", { delivery_offered: true, delivery_fee_cents: 0 });

    await expect(
      ctx.prisma.order.update({ where: { id }, data: { deliveryOffered: false } }),
    ).rejects.toThrow(/figé à la passation/u);
  });

  it("laisse passer un save qui réécrit la même valeur", async () => {
    const origin = await placedOrder();
    const id = await copyOf(origin.id, "9", { delivery_offered: true, delivery_fee_cents: 0 });

    await ctx.prisma.order.update({
      where: { id },
      data: { deliveryOffered: true, note: "réécrite" },
    });

    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { id },
      select: { deliveryOffered: true, note: true },
    });
    expect(row).toEqual({ deliveryOffered: true, note: "réécrite" });
  });
});
