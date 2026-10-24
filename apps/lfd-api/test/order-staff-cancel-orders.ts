import { CommandBus } from "@nestjs/cqrs";

import { ConvertLoyaltyPointsCommand } from "../src/b2b/loyalty/application/commands/convert-loyalty-points.command.js";
import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { E2E_STAFF_ID, E2E_STAFF_SUB } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { pickupSite, placeOrder, placeOrderForCustomer } from "./order-factory.js";
import { context, DAY, scene } from "./order-staff-cancel-scene.js";

/**
 * **Les commandes de la scène d'annulation staff**, passées par le vrai
 * chemin (`placeOrder`, plan T) — séparées de la scène, qui double et
 * enveloppe, pour que chacune tienne en un fichier lisible.
 */

export interface OrderSeed {
  readonly clientele?: OrderClientele;
  /** `ready` ou `confirmed` : posés après la passation (cf. {@link seedOrder}). */
  readonly status?: OrderStatus;
  /**
   * `pending` (défaut) : carte en attente ; `paid` / `failed` : par la vraie
   * confirmation ; `not_required` : au compte, pour une société.
   */
  readonly payment?: PaymentStatus;
  /** `null` : une carte SANS intention (cf. {@link seedOrder}). */
  readonly intent?: null;
  /**
   * Saisie par l'équipe — lien de carte, ou au compte : seule porte encore
   * ouverte sur une journée arrêtée (`OrderDrafting.ensureDayOpen`, vérifié
   * le 2026-10-25). Toujours pour une société.
   */
  readonly byStaff?: boolean;
}

/** Ce que la scène rend d'une commande passée. */
export interface SeededOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly intent: string | null;
  /** Le total TTC que la passation a facturé — relu, jamais recopié. */
  readonly totalCents: number;
}

let seq = 0;

/** L'auteur, et sa société au compte si la commande est pro. */
async function authorOf(seed: OrderSeed): Promise<{ userId: string; companyId: string | null }> {
  seq += 1;
  const ctx = context();
  const author = await createUser(ctx.prisma, {
    auth0Sub: `auth0|annulation-${String(seq)}`,
    email: `annulation-${String(seq)}@example.test`,
  });
  const pro =
    (seed.clientele ?? OrderClientele.public) === OrderClientele.pro ||
    seed.payment === PaymentStatus.not_required ||
    seed.byStaff === true;
  if (!pro) {
    return { userId: author.id, companyId: null };
  }
  const company = await createCompany(ctx.prisma, { enseigne: "Hôtel des Cimes" });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  await attachTo(ctx.prisma, author.id, company.id);
  return { userId: author.id, companyId: company.id };
}

/**
 * Une commande d'un croissant pour {@link DAY}, par le vrai chemin — carte en
 * attente, particulier, par défaut.
 */
export async function seedOrder(seed: OrderSeed = {}): Promise<SeededOrder> {
  const ctx = context();
  const author = await authorOf(seed);
  const mailsBefore = scene.mails.length;
  const onAccount = seed.payment === PaymentStatus.not_required;
  const content = {
    buyerUserId: author.userId,
    forDay: DAY,
    fulfillment: { method: "pickup" as const, pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: "VIE-001", quantity: 1 }],
  };
  const order =
    seed.byStaff === true && author.companyId !== null
      ? await placeOrderForCustomer(ctx, {
          ...content,
          companyId: author.companyId,
          staffUserId: E2E_STAFF_ID,
          settlement: onAccount ? "account" : "link",
        })
      : await placeOrder(ctx, {
          ...content,
          companyId: author.companyId,
          settlement: onAccount ? "account" : "card",
        });
  await settleCard(order.paymentIntentId, seed.payment);
  await forceState(order.id, seed);
  // La passation (et un refus de carte) ont écrit au client : pas le sujet ici.
  scene.mails.splice(mailsBefore);
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { totalCents: true, stripePaymentIntentId: true },
  });
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    intent: row.stripePaymentIntentId,
    totalCents: row.totalCents,
  };
}

/** La carte réglée ou refusée par la vraie confirmation ; en attente sinon. */
async function settleCard(
  intent: string | null,
  payment: PaymentStatus | undefined,
): Promise<void> {
  if (intent === null || (payment !== PaymentStatus.paid && payment !== PaymentStatus.failed)) {
    return;
  }
  const outcome = payment === PaymentStatus.paid ? "succeeded" : "failed";
  await context().app.get(CommandBus).execute(new ConfirmOrderPaymentCommand(intent, outcome));
  await context().drain();
}

/**
 * **Exceptions gardées du plan T (2026-10-25)**, posées après la vraie
 * passation :
 * - `ready` / `confirmed` : un refus d'annulation s'éprouve sur l'état, et le
 *   produire demanderait la clôture du fournil puis le colisage entiers ;
 * - une carte SANS intention : la passation en lie toujours une ; l'état
 *   n'existe qu'après une panne de la passerelle au moment de la passation.
 */
async function forceState(orderId: string, seed: OrderSeed): Promise<void> {
  if (seed.status === undefined && seed.intent !== null) {
    return;
  }
  await context().prisma.order.update({
    where: { id: orderId },
    data: {
      ...(seed.status === undefined ? {} : { status: seed.status }),
      ...(seed.intent === null ? { stripePaymentIntentId: null } : {}),
    },
  });
}

const FREE_CLIENT_PREFIX = "auth0|annulation-gratuite";
let freeSeq = 0;

/**
 * Une commande à total nul, sans règlement — le régime `free`. Le seul
 * chemin réel vers un total nul : un bon de fidélité qui couvre le panier,
 * né par la vraie conversion (un palier de 5 € HT pour un croissant).
 */
export async function seedFreeOrder(): Promise<SeededOrder> {
  freeSeq += 1;
  const ctx = context();
  const user = await createUser(ctx.prisma, {
    auth0Sub: `${FREE_CLIENT_PREFIX}-${String(freeSeq)}`,
    email: `gratuite-${String(freeSeq)}@example.test`,
  });
  await ctx.asSub(E2E_STAFF_SUB).put("/admin/loyalty/settings").send(FREE_PROGRAM).expect(204);
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/loyalty/adjustments")
    .send({ holderKind: "user", holderId: user.id, points: 1_000, reason: "reprise" })
    .expect(204);
  const voucherId = await ctx.app
    .get(CommandBus)
    .execute<ConvertLoyaltyPointsCommand, string>(
      new ConvertLoyaltyPointsCommand("user", user.id, user.id, 1, null),
    );
  const mailsBefore = scene.mails.length;
  const order = await placeOrder(ctx, {
    buyerUserId: user.id,
    forDay: DAY,
    voucherId,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: "VIE-001", quantity: 1 }],
  });
  scene.mails.splice(mailsBefore);
  return { orderId: order.id, orderNumber: order.orderNumber, intent: null, totalCents: 0 };
}

/** Un palier : 1 000 points valent 5 € HT — de quoi couvrir un croissant. */
const FREE_PROGRAM = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
  welcomeBonusPoints: null,
};
