import type { AdminPlacedOrderResponse } from "@lfd/contracts";

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
 * E2E — **les options aux ateliers** (« dont 2 tranchés »,
 * `documentation/catalogue/plan-options-de-commande.md`, lot G3).
 *
 * Ce que seul ce niveau prouve : qu'une ligne passée avec options arrive au
 * plan du fournil à l'arrêt, dans la liste à coliser par le fait durable, et
 * sur le bon de livraison prévu — chacun dans son schéma — sans que le compte
 * à produire bouge ; et qu'une révision qui ne change que les options d'une
 * commande inscrite les porte aux trois.
 */

const BUYER = "auth0|acheteur-options-ateliers";
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
  // Le miroir tel que le fait de fiche v19 l'écrit.
  await ctx.prisma.catalogItemOptionGroups.create({
    data: {
      sku: SKU,
      productId: "prd_croissant",
      receivedAt: new Date(0),
      groups: [
        {
          id: "og_slicing",
          name: "Tranchage",
          choices: [{ key: "sliced", label: "tranché", audience: "both" }],
        },
      ],
    },
  });
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

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

async function placedFor(at: Scene, lines: readonly object[]): Promise<string> {
  const response = await staff()
    .post("/admin/orders")
    .set(INTENT_KEY, freshIntent())
    .send({
      companyId: at.companyId,
      buyerUserId: at.userId,
      settlement: "account",
      ...content(at.pickupId, lines),
    })
    .expect(201);
  return jsonBody<AdminPlacedOrderResponse>(response).id;
}

async function closePlan(): Promise<void> {
  await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);
  await ctx.drain();
}

/** Ce que chaque atelier a écrit des options de la ligne, dans son schéma. */
async function workshopOptions(orderId: string) {
  const production = await ctx.prisma.productionOrderLine.findFirstOrThrow({
    where: { sku: SKU, order: { orderId } },
    select: { options: true },
  });
  const packing = await ctx.prisma.packingLine.findFirstOrThrow({
    where: { sku: SKU, orderId },
    select: { options: true },
  });
  const note = await ctx.prisma.deliveryNoteLine.findFirstOrThrow({
    where: { sku: SKU, note: { orderId } },
    select: { options: true },
  });
  return { production: production.options, packing: packing.options, note: note.options };
}

const SLICED = (quantity: number) => ({ group: "og_slicing", choice: "sliced", quantity });
const MENTION = (quantity: number) => ({
  groupName: "Tranchage",
  choiceLabel: "tranché",
  quantity,
});

describe("les options aux ateliers (G3)", () => {
  it("passation → fournil → colisage → bon : « dont 2 tranchés » partout, le compte inchangé", async () => {
    const at = await scene();
    const orderId = await placedFor(at, [{ sku: SKU, quantity: 4, optionChoices: [SLICED(2)] }]);

    await closePlan();

    const written = await workshopOptions(orderId);
    expect(written.production).toEqual([MENTION(2)]);
    expect(written.packing).toEqual([MENTION(2)]);
    expect(written.note).toEqual([
      {
        group: "og_slicing",
        groupName: "Tranchage",
        choice: "sliced",
        choiceLabel: "tranché",
        quantity: 2,
        position: 0,
      },
    ]);
    const count = await ctx.prisma.productionCount.findFirstOrThrow({
      where: { serviceDay: DAY, sku: SKU },
      select: { quantity: true },
    });
    expect(count.quantity).toBe(4);

    const board = await staff().get(`/admin/packing/${DAY}/board`).expect(200);
    expect(JSON.stringify(board.body)).toContain('"choiceLabel":"tranché"');
    const worksheet = await staff().get(`/admin/production/worksheet?date=${DAY}`).expect(200);
    expect(JSON.stringify(worksheet.body)).toContain('"choiceLabel":"tranché"');
  });

  it("une révision qui ne change que les options d'une commande inscrite les porte aux trois ateliers", async () => {
    const at = await scene();
    const orderId = await placedFor(at, [{ sku: SKU, quantity: 4, optionChoices: [SLICED(2)] }]);
    await closePlan();

    await staff()
      .post(`/admin/orders/${orderId}/revisions`)
      .send({
        expectedRevision: 0,
        ...content(at.pickupId, [{ sku: SKU, quantity: 4, optionChoices: [SLICED(3)] }]),
      })
      .expect(200);
    await ctx.drain();

    const written = await workshopOptions(orderId);
    expect(written.production).toEqual([MENTION(3)]);
    expect(written.packing).toEqual([MENTION(3)]);
    expect(written.note).toEqual([expect.objectContaining({ choice: "sliced", quantity: 3 })]);
    const count = await ctx.prisma.productionCount.findFirstOrThrow({
      where: { serviceDay: DAY, sku: SKU },
      select: { quantity: true },
    });
    expect(count.quantity).toBe(4);
  });

  it("une ligne sans option : `[]` partout, comme avant", async () => {
    const at = await scene();
    const orderId = await placedFor(at, [{ sku: SKU, quantity: 4 }]);

    await closePlan();

    expect(await workshopOptions(orderId)).toEqual({ production: [], packing: [], note: [] });
  });
});
