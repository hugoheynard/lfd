/**
 * E2E du **jour d'un reliquat** (plan E7, lot L1 —
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 2).
 *
 * Ce que seul le vrai Postgres prouve : que la base refuse un BL de rang > 1
 * sans jour de service, même écrit hors du domaine ; qu'un BL-1 garde
 * `service_day` à `NULL` ; qu'un reliquat prévu par `planRemainder` relit son
 * jour tel qu'il a été écrit.
 *
 * Doublé : la signature des jetons (le jeton EST le `sub`).
 */
import type { AdminPlacedOrderResponse } from "@lfd/contracts";

import {
  DeliveryNote,
  type DeliveryNoteRemainderSource,
} from "../src/b2b/delivery-notes/domain/entities/delivery-note.js";
import { DeliveryNoteRepository } from "../src/b2b/delivery-notes/domain/ports/delivery-note.repository.js";
import { ORDER_TERMS } from "../src/b2b/delivery-notes/domain/value-objects/__tests__/delivery-note-terms.fixture.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const DAY = serviceDay(7);
const NEXT_DAY = serviceDay(8);
const BUYER = "auth0|acheteur-jour-du-reliquat";
const PLANNED_AT = new Date(0);

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      {
        token: AdminTokenVerifier,
        value: {
          verify: (): Promise<{ subject: string; scopes: string[] }> =>
            Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
        },
      },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Une commande au compte, saisie par l'équipe ; rend son id et son numéro. */
async function placeOnAccount(): Promise<{ readonly id: string; readonly number: string }> {
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, {
    auth0Sub: BUYER,
    email: "acheteur-reliquat@test.fr",
  });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  const response = await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/orders")
    .send({
      companyId: company.id,
      buyerUserId: user.id,
      settlement: "account",
      requestedDeliveryDate: DAY,
      fulfillmentMethod: "pickup",
      pickupAddressId: point.id,
      requestedWindow: { start: "07:00", end: "08:00" },
      note: "",
      lines: [{ sku: "VIE-001", quantity: 4 }],
    })
    .expect(201);
  const { id } = jsonBody<AdminPlacedOrderResponse>(response);
  const { orderNumber } = await ctx.prisma.order.findUniqueOrThrow({
    where: { id },
    select: { orderNumber: true },
  });
  return { id, number: orderNumber };
}

function source(order: {
  readonly id: string;
  readonly number: string;
}): DeliveryNoteRemainderSource {
  return {
    orderId: order.id,
    orderNumber: order.number,
    orderDay: DAY,
    terms: ORDER_TERMS,
    lines: [
      {
        sku: "VIE-001",
        productName: "Croissant",
        unitPriceMillicents: 95_000,
        vatRate: 5.5,
        quantity: 2,
        lineTotalCents: 1_900,
        unitPriceTtcCents: null,
        lineTotalTtcCents: null,
        pickupDiscountEligible: true,
      },
    ],
  };
}

async function serviceDaysOf(orderId: string): Promise<readonly (string | null)[]> {
  const rows = await ctx.prisma.deliveryNote.findMany({
    where: { orderId },
    orderBy: { rank: "asc" },
    select: { serviceDay: true },
  });
  return rows.map((row) => row.serviceDay?.toISOString().slice(0, 10) ?? null);
}

describe("delivery_note.service_day — le jour d'un reliquat", () => {
  it("un BL-1 garde service_day à NULL, un reliquat relit son jour", async () => {
    const order = await placeOnAccount();
    const notes = ctx.app.get(DeliveryNoteRepository);

    await notes.saveNew(DeliveryNote.planFromOrder("dn_l1_1", source(order), PLANNED_AT));
    await notes.saveNew(
      DeliveryNote.planRemainder("dn_l1_2", source(order), 2, NEXT_DAY, PLANNED_AT),
    );

    expect(await serviceDaysOf(order.id)).toEqual([null, NEXT_DAY]);
    const [, remainder] = await notes.loadForOrders([order.id]);
    expect(remainder?.toState()).toMatchObject({
      rank: 2,
      number: `BL-${order.number.slice(4)}-2`,
      serviceDay: NEXT_DAY,
    });
  });

  it("la base refuse un BL de rang 2 sans jour, même écrit hors du domaine", async () => {
    const order = await placeOnAccount();

    await expect(
      ctx.prisma.$executeRaw`
        INSERT INTO "public"."delivery_note" (id, order_id, rank, number, status, planned_at, updated_at)
        VALUES ('dn_raw_2', ${order.id}, 2, 'BL-RAW-2', 'planned', now(), now())`,
    ).rejects.toThrow(/delivery_note_service_day_beyond_first_rank/);
  });
});
