/**
 * E2E des **totaux du bon de livraison** (plan
 * plan E4a (`documentation/commandes/bon-de-livraison.md`), § 3 et § 4).
 *
 * Ce que seul le vrai Postgres prouve : que l'en-tête recopié à l'arrêt du
 * plan est celui de la commande, colonne par colonne, JSON compris ; que la
 * re-clôture après révision recopie les NOUVEAUX totaux ; que le CHECK « tout
 * ou rien » de `20261024230000` accepte ce que l'agrégat écrit ; et que le
 * réconciliateur complète un BL remis d'avant E4a, puis que son contrôle rend
 * zéro écart.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe.
 */
import type { AdminPlacedOrderResponse } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import { MarkOrderFulfilledCommand } from "../src/b2b/orders/application/commands/mark-order-fulfilled.command.js";
import type { DeliveryNoteReconciliationReport } from "../src/b2b/delivery-notes/application/commands/reconcile-delivery-notes.command.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const DAY = serviceDay(7);
const BUYER = "auth0|acheteur-bl-totaux";

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    const id = `pi_blt_${String(intentCounter)}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment",
    }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

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
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Un point de retrait et une société au compte. */
interface Scene {
  readonly companyId: string;
  readonly buyerUserId: string;
  readonly pickupId: string;
}

async function scene(): Promise<Scene> {
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
    email: "acheteur-bl-totaux@test.fr",
  });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  return { companyId: company.id, buyerUserId: user.id, pickupId: point.id };
}

function content(pickupId: string, quantity: number): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001", quantity }],
  };
}

/** Une commande au compte, saisie par l'équipe. */
async function placeOnAccount(where: Scene, quantity = 10): Promise<string> {
  const response = await staff()
    .post("/admin/orders")
    .send({
      companyId: where.companyId,
      buyerUserId: where.buyerUserId,
      settlement: "account",
      ...content(where.pickupId, quantity),
    })
    .expect(201);
  return jsonBody<AdminPlacedOrderResponse>(response).id;
}

async function closePlan(): Promise<void> {
  await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);
  await ctx.drain();
}

/** Les dix totaux d'en-tête, sous les mêmes noms côté commande et côté BL. */
const TERMS = {
  subtotalCents: true,
  discountCents: true,
  voucherDiscountCents: true,
  deliveryFeeCents: true,
  deliveryVatMode: true,
  lateFeeCents: true,
  lateFeeAdjustment: true,
  vatShares: true,
  vatCents: true,
  totalCents: true,
} as const;

function orderTermsOf(orderId: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      ...TERMS,
      lines: { orderBy: { id: "asc" }, select: { pickupDiscountEligible: true } },
    },
  });
}

function notesOf(orderId: string) {
  return ctx.prisma.deliveryNote.findMany({
    where: { orderId },
    orderBy: { rank: "asc" },
    select: {
      ...TERMS,
      id: true,
      status: true,
      lines: { orderBy: { id: "asc" }, select: { pickupDiscountEligible: true } },
    },
  });
}

/** L'en-tête et l'éligibilité des lignes d'une commande, tels que le BL doit les porter. */
async function expectedOf(orderId: string) {
  return orderTermsOf(orderId);
}

async function markFulfilled(orderId: string, at = new Date()): Promise<void> {
  const { orderNumber } = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { orderNumber: true },
  });
  await ctx.app
    .get(CommandBus)
    .execute(new MarkOrderFulfilledCommand(orderNumber, E2E_STAFF_ID, at, "manual"));
}

async function reconcile(): Promise<DeliveryNoteReconciliationReport> {
  const response = await staff().post("/admin/delivery-notes/reconcile").expect(200);
  return jsonBody<DeliveryNoteReconciliationReport>(response);
}

describe("le BL porte les totaux de sa commande (plan E4a)", () => {
  it("arrêt du plan → en-tête du BL égal à la commande, colonne par colonne", async () => {
    const account = await placeOnAccount(await scene());

    await closePlan();

    const [note] = await notesOf(account);
    const expected = await expectedOf(account);
    expect(expected.totalCents).toBeGreaterThan(0);
    expect(note).toMatchObject(expected);
  });

  it("arrêt → réouverture → révision → re-clôture : l'en-tête porte les NOUVEAUX totaux", async () => {
    const where = await scene();
    const account = await placeOnAccount(where);
    await closePlan();
    const before = await expectedOf(account);
    await staff().post(`/admin/production/batch/${DAY}/reopen`).expect(201);
    await ctx.drain();
    await staff()
      .post(`/admin/orders/${account}/revisions`)
      .send({ expectedRevision: 0, ...content(where.pickupId, 4) })
      .expect(200);

    await closePlan();

    const after = await expectedOf(account);
    expect(after.totalCents).not.toBe(before.totalCents);
    const notes = await notesOf(account);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject(after);
  });

  it("réconciliateur → un BL remis d'avant E4a est complété, puis le contrôle rend zéro écart", async () => {
    const account = await placeOnAccount(await scene());
    await closePlan();
    await markFulfilled(account);
    const [handedOver] = await notesOf(account);
    expect(handedOver?.status).toBe("handed_over");
    // « Avant E4a » : l'en-tête et l'éligibilité, vides, comme la migration les laisse.
    await ctx.prisma.$executeRaw`
      UPDATE "public"."delivery_note"
         SET subtotal_cents = NULL, discount_cents = NULL, voucher_discount_cents = NULL,
             delivery_fee_cents = NULL, delivery_vat_mode = NULL, late_fee_cents = NULL,
             late_fee_adjustment = NULL, vat_shares = NULL, vat_cents = NULL, total_cents = NULL
       WHERE order_id = ${account}`;
    await ctx.prisma.$executeRaw`
      UPDATE "public"."delivery_note_line" SET pickup_discount_eligible = NULL
       WHERE note_id = ${handedOver?.id ?? ""}`;

    const first = await reconcile();

    expect(first).toMatchObject({ completed: 1, failed: 0, unrepaired: [] });
    const [completed] = await notesOf(account);
    expect(completed).toMatchObject({ status: "handed_over", ...(await expectedOf(account)) });
    const second = await reconcile();
    expect(second).toMatchObject({ completed: 0, terms: { compared: 1, gaps: [] } });
  });

  it("le CHECK « tout ou rien » refuse un en-tête à moitié posé", async () => {
    const account = await placeOnAccount(await scene());
    await closePlan();

    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "public"."delivery_note" SET total_cents = NULL WHERE order_id = ${account}`,
    ).rejects.toThrow(/delivery_note_terms_all_or_nothing/);
  });
});
