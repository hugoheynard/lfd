/**
 * **Une commande de test, passée par le vrai chemin** (plan T,
 * `documentation/commandes/plan-t-commandes-de-test-par-le-vrai-chemin.md`).
 *
 * Elle passe par `PlaceOrderCommand` sur le bus — la commande que sert
 * `POST /orders` : le numéro (`ORD-<n>`), les prix ré-résolus au catalogue, la
 * TVA ventilée, les contrôles de passation sont ceux de la production. Une
 * suite qui semait sa commande par `prisma.order.create` inventait tout cela,
 * et le 2026-10-24 un numéro `ORD-…` a fait lever l'arrêt du plan sans
 * qu'aucun test l'ait vu.
 *
 * Deux écarts seulement avec la passation réelle, et ils sont ici pour ne pas
 * être recopiés ailleurs :
 *
 * - **la date de passation** (`placedAt`) : la commande se passe sous un
 *   contexte de requête DATÉ — l'heure limite se juge comme ce jour-là — puis
 *   `created_at` est recalé, parce que la colonne prend `now()` de la base et
 *   qu'aucune route ne passe une commande dans le passé. C'est le geste du semis
 *   de démonstration (`src/dev/seeding/order-placing.seed.ts`, `place`) ;
 * - rien d'autre : un état d'après la passation (payée, remise, annulée) se
 *   produit par ses propres gestes, ou reste une écriture brute justifiée
 *   dans la suite qui en a besoin.
 */
import type { BillingAddressPayload, PlaceOrderPayload, StaffSettlement } from "@lfd/contracts";
import {
  addDays,
  adminPlaceOrderPayloadSchema,
  instantToLocal,
  placeOrderPayloadSchema,
} from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";
import { randomUUID } from "node:crypto";

import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import { MarkOrderFulfilledCommand } from "../src/b2b/orders/application/commands/mark-order-fulfilled.command.js";
import {
  PlaceOrderForCustomerCommand,
  type PlaceOrderForCustomerResult,
} from "../src/b2b/orders/application/commands/place-order-for-customer.command.js";
import {
  PlaceOrderCommand,
  type PlaceOrderResult,
} from "../src/b2b/orders/application/commands/place-order.command.js";
import { runWithRequestContext } from "../src/platform/context/request-context.store.js";
import { newTraceId } from "../src/platform/context/trace-context.js";
import type { PrismaService } from "../src/platform/database/prisma.service.js";
import { E2E_STAFF_ID, serviceDay, type E2eContext } from "./e2e-harness.js";

/** Une ligne de panier : le client n'envoie qu'un SKU et une quantité, le serveur tarife. */
export interface OrderLineSeed {
  readonly sku: string;
  readonly quantity: number;
}

/** Retrait à un point, ou livraison à une adresse (du carnet ou dictée). */
export type FulfillmentSeed =
  | { readonly method: "pickup"; readonly pickupSiteId: string }
  | {
      readonly method: "delivery";
      readonly address: BillingAddressPayload;
      /** L'adresse du carnet dont elle vient ; absente = dictée à la commande. */
      readonly addressId?: string;
    };

/** Ce qu'une suite peut imposer à une commande ; le reste est un défaut plausible. */
export interface OrderSeed {
  /** L'acheteur — le client au nom de qui la commande est passée. */
  readonly buyerUserId: string;
  /** La société visée ; absente ou `null` = commande personnelle. */
  readonly companyId?: string | null;
  readonly fulfillment: FulfillmentSeed;
  /**
   * Le jour de service ; absent = une semaine après la passation — après
   * `placedAt` s'il est dit, sinon après maintenant ({@link serviceDay}).
   */
  readonly forDay?: string;
  /** L'instant de passation ; absent = maintenant. */
  readonly placedAt?: Date;
  /** Le règlement demandé ; absent = le serveur décide (au compte si accordé, carte sinon). */
  readonly settlement?: "card" | "account";
  /** Absentes = trois croissants. */
  readonly lines?: readonly OrderLineSeed[];
  /** La tranche demandée ; absente = 07:00–08:00. */
  readonly window?: { readonly start: string | null; readonly end: string };
  readonly note?: string;
  /** La langue de la boutique à la passation ; absente = non dite. */
  readonly locale?: "fr" | "en" | "it";
  /** Le bon de fidélité imputé ; absent = aucun. Un particulier seulement. */
  readonly voucherId?: string;
}

/** La commande passée : son identifiant et le numéro que la production lui a donné. */
export interface PlacedTestOrder {
  readonly id: string;
  readonly orderNumber: string;
  /**
   * L'intention de carte que la passation a liée, `null` au compte ou sur un
   * total nul. La suite qui la règle la reprend d'ici plutôt que de la deviner.
   */
  readonly paymentIntentId: string | null;
}

const DEFAULT_LINES: readonly OrderLineSeed[] = [{ sku: "VIE-001", quantity: 3 }];
const DEFAULT_WINDOW = { start: "07:00", end: "08:00" } as const;
const DEFAULT_LEAD_DAYS = 7;

/** Ce que les deux portes partagent du corps de la commande. */
type OrderContentSeed = Pick<
  OrderSeed,
  "fulfillment" | "forDay" | "placedAt" | "lines" | "window" | "note"
>;

/** Une semaine après la passation : l'heure limite se juge à l'instant de passation. */
function defaultServiceDay(placedAt: Date | undefined): string {
  return placedAt === undefined
    ? serviceDay()
    : addDays(instantToLocal(placedAt).day, DEFAULT_LEAD_DAYS);
}

/** Le contenu commun aux deux portes : acheminement, jour, tranche, lignes. */
function contentOf(seed: OrderContentSeed) {
  const { fulfillment } = seed;
  return {
    idempotencyKey: randomUUID(),
    fulfillmentMethod: fulfillment.method,
    pickupAddressId: fulfillment.method === "pickup" ? fulfillment.pickupSiteId : null,
    deliveryAddress: fulfillment.method === "delivery" ? fulfillment.address : null,
    deliveryAddressId: fulfillment.method === "delivery" ? (fulfillment.addressId ?? null) : null,
    requestedDeliveryDate: seed.forDay ?? defaultServiceDay(seed.placedAt),
    requestedWindow: seed.window ?? DEFAULT_WINDOW,
    note: seed.note ?? "",
    lines: (seed.lines ?? DEFAULT_LINES).map((line) => ({ ...line })),
  };
}

/** Le corps qu'enverrait la boutique, relu par le schéma du contrat — comme le contrôleur le fait. */
function payloadOf(seed: OrderSeed): PlaceOrderPayload {
  return placeOrderPayloadSchema.parse({
    ...contentOf(seed),
    settlement: seed.settlement ?? null,
    ...(seed.locale === undefined ? {} : { locale: seed.locale }),
    ...(seed.voucherId === undefined ? {} : { voucherId: seed.voucherId }),
  });
}

/**
 * Exécute la passation sous un contexte DATÉ, attend ses abonnés, recale
 * `created_at` si la passation est antidatée, et relit l'intention liée.
 */
async function placeAt(
  ctx: E2eContext,
  placedAt: Date | undefined,
  actor: { readonly type: "customer" | "staff"; readonly id: string },
  run: () => Promise<{ readonly id: string; readonly orderNumber: string }>,
): Promise<PlacedTestOrder> {
  const placed = await runWithRequestContext(
    { now: placedAt ?? new Date(), traceId: newTraceId(), actor },
    run,
  );
  await ctx.drain();
  if (placedAt !== undefined) {
    // Aucune route ne passe une commande dans le passé : `created_at` prend
    // `now()` de la base. Recalé ici, et ici seulement (plan T, 2026-10-24).
    await ctx.prisma.order.update({ where: { id: placed.id }, data: { createdAt: placedAt } });
  }
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: placed.id },
    select: { stripePaymentIntentId: true },
  });
  return {
    id: placed.id,
    orderNumber: placed.orderNumber,
    paymentIntentId: row.stripePaymentIntentId,
  };
}

/**
 * Passe une commande par le bus, comme `POST /orders`, et rend son identifiant
 * et son numéro. Attend la fin du travail hors requête (abonnés de la
 * passation) avant de rendre la main — et avant d'antidater, pour que rien ne
 * lise l'instant réel après coup.
 */
export function placeOrder(ctx: E2eContext, seed: OrderSeed): Promise<PlacedTestOrder> {
  return placeAt(ctx, seed.placedAt, { type: "customer", id: seed.buyerUserId }, () =>
    ctx.app
      .get(CommandBus)
      .execute<PlaceOrderCommand, PlaceOrderResult>(
        new PlaceOrderCommand(seed.buyerUserId, payloadOf(seed), seed.companyId ?? null),
      ),
  );
}

/** Ce que la saisie de l'équipe ajoute : qui saisit, et un règlement au compte ou par lien. */
export interface StaffOrderSeed extends Omit<
  OrderSeed,
  "companyId" | "settlement" | "locale" | "voucherId"
> {
  /** La fiche staff de qui saisit. */
  readonly staffUserId: string;
  /** Toujours une société : l'équipe ne saisit pas de commande personnelle. */
  readonly companyId: string;
  readonly settlement: StaffSettlement;
}

/**
 * Passe une commande **au nom d'un client**, par le bus, comme
 * `POST /admin/orders` — le même chemin de composition, le mur porté sur
 * l'acheteur, et un lien de carte ou un règlement au compte.
 */
export function placeOrderForCustomer(
  ctx: E2eContext,
  seed: StaffOrderSeed,
): Promise<PlacedTestOrder> {
  const payload = adminPlaceOrderPayloadSchema.parse({
    ...contentOf(seed),
    companyId: seed.companyId,
    buyerUserId: seed.buyerUserId,
    settlement: seed.settlement,
  });
  return placeAt(ctx, seed.placedAt, { type: "staff", id: seed.staffUserId }, () =>
    ctx.app
      .get(CommandBus)
      .execute<PlaceOrderForCustomerCommand, PlaceOrderForCustomerResult>(
        new PlaceOrderForCustomerCommand(seed.staffUserId, payload),
      ),
  );
}

/**
 * Le point de retrait des commandes de test — le premier ouvert, ou un « Labo »
 * semé s'il n'y en a aucun. Un site est un réglage, pas un agrégat à
 * invariant : l'écrire en base n'invente rien.
 */
export async function pickupSite(prisma: PrismaService): Promise<string> {
  const existing = await prisma.site.findFirst({
    where: { archivedAt: null, pickup: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing !== null) {
    return existing.id;
  }
  const created = await prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "5 rue du Four",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Une passerelle de carte doublée qui émet une intention DISTINCTE par
 * passation (`<préfixe>_1`, `<préfixe>_2`…) — sans quoi deux commandes
 * partageraient une intention, et le règlement de l'une solderait l'autre.
 */
export function cardGatewayDouble(prefix: string) {
  let issued = 0;
  return {
    createIntent: () => {
      issued += 1;
      const paymentIntentId = `${prefix}_${String(issued)}`;
      return Promise.resolve({ paymentIntentId, clientSecret: `${paymentIntentId}_secret` });
    },
    publishableKey: () => "pk_e2e",
    parseWebhook: () => ({ kind: "ignored" as const }),
    cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
  };
}

/**
 * Règle la carte d'une commande comme le webhook Stripe le ferait — par la
 * vraie commande de confirmation. Sans intention (au compte, total nul), il n'y
 * a rien à régler.
 */
export async function payByCard(ctx: E2eContext, order: PlacedTestOrder): Promise<void> {
  if (order.paymentIntentId === null) {
    return;
  }
  await ctx.app
    .get(CommandBus)
    .execute(new ConfirmOrderPaymentCommand(order.paymentIntentId, "succeeded"));
  await ctx.drain();
}

/**
 * Remet une commande comme le comptoir le fait — par la commande du commerce
 * qui recopie la remise constatée (`order.fulfilled`, points, BL). L'instant
 * est maintenant : une remise dans le passé n'a pas de route.
 */
export async function handOver(ctx: E2eContext, order: PlacedTestOrder): Promise<void> {
  await ctx.app
    .get(CommandBus)
    .execute(new MarkOrderFulfilledCommand(order.orderNumber, E2E_STAFF_ID, new Date(), "scan"));
  await ctx.drain();
}
