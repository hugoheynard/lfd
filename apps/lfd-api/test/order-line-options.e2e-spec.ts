import type { AdminPlacedOrderResponse, OrderView } from "@lfd/contracts";

import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { pickupSite } from "./order-factory.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

/**
 * E2E — **les options d'une ligne** (« dont 2 tranchés »,
 * `documentation/catalogue/plan-options-de-commande.md`, lot G2).
 *
 * Ce que seul ce niveau prouve : la table fille sous la vraie ligne (et sa
 * cascade quand la révision réécrit les lignes), la lecture filtrée par la
 * clientèle du CLIENT quand l'équipe saisit à sa place, les vues client et
 * staff, et qu'aucun montant ne bouge.
 */

const BUYER = "auth0|acheteur-options";
const DAY = serviceDay(7);
const SKU = "VIE-001-1";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  // Le miroir tel que le fait de fiche v19 l'écrit : toutes clientèles confondues.
  await ctx.prisma.catalogItemOptionGroups.create({
    data: {
      sku: SKU,
      productId: "prd_croissant",
      receivedAt: new Date(0),
      groups: [
        {
          id: "og_slicing",
          name: "Tranchage",
          choices: [
            { key: "sliced", label: "tranché", audience: "both" },
            { key: "gift", label: "paquet cadeau", audience: "public" },
          ],
        },
        {
          id: "og_wrap",
          name: "Emballage",
          choices: [{ key: "wrapped", label: "emballé", audience: "pro" }],
        },
      ],
    },
  });
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

function content(pickupId: string, lines: readonly object[]): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines,
  };
}

interface Scene {
  readonly companyId: string;
  readonly userId: string;
  readonly pickupId: string;
}

async function scene(): Promise<Scene> {
  const pickupId = await pickupSite(ctx.prisma);
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  return { companyId: company.id, userId: user.id, pickupId };
}

/** L'équipe saisit pour le client pro, au compte. */
function placeFor(at: Scene, lines: readonly object[]) {
  return staff()
    .post("/admin/orders")
    .set(INTENT_KEY, freshIntent())
    .send({
      companyId: at.companyId,
      buyerUserId: at.userId,
      settlement: "account",
      ...content(at.pickupId, lines),
    });
}

async function placedFor(at: Scene, lines: readonly object[]): Promise<string> {
  return jsonBody<AdminPlacedOrderResponse>(await placeFor(at, lines).expect(201)).id;
}

const SLICED_2 = { group: "og_slicing", choice: "sliced", quantity: 2 };
const WRAPPED_4 = { group: "og_wrap", choice: "wrapped", quantity: 4 };

describe("Passation — les options d'une ligne", () => {
  it("🔴 fige « dont 2 tranchés » et « emballé » sous la ligne, et les vues client et staff les montrent", async () => {
    const at = await scene();
    const orderId = await placedFor(at, [
      { sku: SKU, quantity: 4, optionChoices: [SLICED_2, WRAPPED_4] },
    ]);

    const rows = await ctx.prisma.orderLineOption.findMany({
      where: { orderLine: { orderId } },
      orderBy: { position: "asc" },
      select: { groupName: true, choiceLabel: true, quantity: true },
    });
    expect(rows).toEqual([
      { groupName: "Tranchage", choiceLabel: "tranché", quantity: 2 },
      { groupName: "Emballage", choiceLabel: "emballé", quantity: 4 },
    ]);

    const expected = [
      {
        group: "og_slicing",
        groupName: "Tranchage",
        choice: "sliced",
        choiceLabel: "tranché",
        quantity: 2,
      },
      {
        group: "og_wrap",
        groupName: "Emballage",
        choice: "wrapped",
        choiceLabel: "emballé",
        quantity: 4,
      },
    ];
    const asStaff = jsonBody<OrderView>(await staff().get(`/admin/orders/${orderId}`).expect(200));
    expect(asStaff.lines[0]?.optionChoices).toEqual(expected);
    const asClient = jsonBody<OrderView>(
      await ctx.asSub(BUYER).get(`/orders/${orderId}`).expect(200),
    );
    expect(asClient.lines[0]?.optionChoices).toEqual(expected);
  });

  it("🔴 aucun montant ne bouge : même ligne, même total, avec ou sans options", async () => {
    const at = await scene();
    const bare = await placedFor(at, [{ sku: SKU, quantity: 4 }]);
    const optioned = await placedFor(at, [{ sku: SKU, quantity: 4, optionChoices: [SLICED_2] }]);

    const amounts = (orderId: string) =>
      ctx.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          totalCents: true,
          vatShares: true,
          discountCents: true,
          lines: {
            select: {
              unitPriceMillicents: true,
              vatRate: true,
              lineTotalCents: true,
              lineTotalTtcCents: true,
            },
          },
        },
      });
    expect(await amounts(optioned)).toEqual(await amounts(bare));
  });

  it("une commande sans option n'écrit aucune option et sa vue n'en porte pas", async () => {
    const at = await scene();
    const orderId = await placedFor(at, [{ sku: SKU, quantity: 4 }]);

    expect(await ctx.prisma.orderLineOption.count({ where: { orderLine: { orderId } } })).toBe(0);
    const view = jsonBody<OrderView>(await staff().get(`/admin/orders/${orderId}`).expect(200));
    expect(view.lines[0]).not.toHaveProperty("optionChoices");
  });

  it("🔴 l'équipe qui saisit pour un pro applique SA clientèle : un choix réservé au public est refusé", async () => {
    const at = await scene();

    const refused = await placeFor(at, [
      {
        sku: SKU,
        quantity: 4,
        optionChoices: [{ group: "og_slicing", choice: "gift", quantity: 1 }],
      },
    ]).expect(409);

    expect(refused.body).toMatchObject({ code: "orders.option.choice_not_offered" });
  });

  it("refuse un groupe que l'article ne propose pas", async () => {
    const at = await scene();

    const refused = await placeFor(at, [
      { sku: "VIE-002-1", quantity: 2, optionChoices: [SLICED_2] },
    ]).expect(409);

    expect(refused.body).toMatchObject({ code: "orders.option.group_not_offered" });
  });

  it("refuse plus d'options que la ligne n'a d'unités, et une quantité nulle", async () => {
    const at = await scene();

    const above = await placeFor(at, [{ sku: SKU, quantity: 1, optionChoices: [SLICED_2] }]).expect(
      400,
    );
    expect(above.body).toMatchObject({ code: "orders.option.quantity_above_line" });
    const zero = await placeFor(at, [
      { sku: SKU, quantity: 2, optionChoices: [{ ...SLICED_2, quantity: 0 }] },
    ]).expect(400);
    expect(zero.body).toMatchObject({ code: "orders.option.quantity_not_positive" });
  });
});

describe("Révision — les options d'une ligne gardée", () => {
  function revise(at: Scene, orderId: string, lines: readonly object[], expectedRevision = 0) {
    return staff()
      .post(`/admin/orders/${orderId}/revisions`)
      .send({ expectedRevision, ...content(at.pickupId, lines) });
  }

  async function options(orderId: string) {
    return ctx.prisma.orderLineOption.findMany({
      where: { orderLine: { orderId } },
      orderBy: { position: "asc" },
      select: { choiceKey: true, quantity: true },
    });
  }

  it("🔴 changer les seules options est une modification : elles sont remplacées, le total ne bouge pas", async () => {
    const at = await scene();
    const orderId = await placedFor(at, [{ sku: SKU, quantity: 4, optionChoices: [SLICED_2] }]);
    const before = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { totalCents: true },
    });

    await revise(at, orderId, [{ sku: SKU, quantity: 4, optionChoices: [WRAPPED_4] }]).expect(200);

    expect(await options(orderId)).toEqual([{ choiceKey: "wrapped", quantity: 4 }]);
    const after = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { totalCents: true, revision: true },
    });
    expect(after).toEqual({ totalCents: before.totalCents, revision: 1 });
  });

  it("une ligne redemandée sans options garde les siennes, réduites d'abord sur le « sans »", async () => {
    const at = await scene();
    const orderId = await placedFor(at, [{ sku: SKU, quantity: 4, optionChoices: [SLICED_2] }]);

    await revise(at, orderId, [{ sku: SKU, quantity: 3 }]).expect(200);
    expect(await options(orderId)).toEqual([{ choiceKey: "sliced", quantity: 2 }]);

    await revise(at, orderId, [{ sku: SKU, quantity: 1 }], 1).expect(200);
    expect(await options(orderId)).toEqual([{ choiceKey: "sliced", quantity: 1 }]);
  });

  it("refuse une révision dont les options dépassent la nouvelle quantité", async () => {
    const at = await scene();
    const orderId = await placedFor(at, [{ sku: SKU, quantity: 4 }]);

    const refused = await revise(at, orderId, [
      { sku: SKU, quantity: 1, optionChoices: [SLICED_2] },
    ]).expect(400);

    expect(refused.body).toMatchObject({ code: "orders.option.quantity_above_line" });
  });

  it("des options identiques ne font pas une modification", async () => {
    const at = await scene();
    const orderId = await placedFor(at, [{ sku: SKU, quantity: 4, optionChoices: [SLICED_2] }]);

    const unchanged = await revise(at, orderId, [
      { sku: SKU, quantity: 4, optionChoices: [SLICED_2] },
    ]).expect(400);

    expect(unchanged.body).toMatchObject({ code: "orders.revise.unchanged" });
  });
});
