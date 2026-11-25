/**
 * **La scène de la transformation d'un reliquat** (lot B3, plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 4) : un
 * pro au compte, un point de retrait, deux zones à frais et leurs adresses au
 * carnet, la commande d'origine passée par l'équipe, puis son reliquat.
 *
 * Le reliquat naît par son agrégat (`Backorder.open`) et le vrai dépôt : sa
 * naissance dans la décision du départ est éprouvée par
 * `backorder-opening.e2e-spec.ts` ; ici, ce qui compte est ce que sa
 * transformation facture.
 */
import type { AdminOrderEstimateView, AdminPlacedOrderResponse } from "@lfd/contracts";

import { Backorder } from "../src/lafoliecoffee/orders/backorder/domain/entities/backorder.js";
import { BackorderRepository } from "../src/lafoliecoffee/orders/backorder/domain/ports/backorder.repository.js";
import { BackorderLine } from "../src/lafoliecoffee/orders/backorder/domain/value-objects/backorder-line.js";
import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

export const SKU = "VIE-001-1";
const BUYER_SUB = "auth0|reliquat";
/** L'échéance inscrite sur les adresses du carnet. */
const DEADLINE = "10:00";

export interface BackorderDecor {
  readonly pickupId: string;
  readonly companyId: string;
  readonly buyerId: string;
  /** Une adresse du carnet dans la zone A (15,00 € HT) et une dans la zone B (25,00 € HT). */
  readonly addressA: string;
  readonly addressB: string;
}

const ADDRESS_A = {
  label: "",
  ligne1: "1 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};
const ADDRESS_B = { ...ADDRESS_A, ligne1: "9 route du Col", codePostal: "73320", ville: "Tignes" };
export const ZONE_A_FEE_CENTS = 1_500;
const ZONE_B_FEE_CENTS = 2_500;

export const staff = (ctx: E2eContext): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Un point, un pro actif au compte, deux zones à frais et leurs adresses. */
export async function backorderDecor(ctx: E2eContext): Promise<BackorderDecor> {
  const pickupId = jsonBody<{ id: string }>(
    await staff(ctx)
      .post("/admin/pickup-addresses")
      .set(INTENT_KEY, freshIntent())
      .send({ ...ADDRESS_A, label: "Le Labo", discounts: { b2b: null, b2c: null } })
      .expect(201),
  ).id;
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER_SUB });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "A", feeMode: "amount", feeValue: ZONE_A_FEE_CENTS },
  });
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73320"], label: "B", feeMode: "amount", feeValue: ZONE_B_FEE_CENTS },
  });
  return {
    pickupId,
    companyId: company.id,
    buyerId: user.id,
    addressA: await bookAddress(ctx, company.id, ADDRESS_A),
    addressB: await bookAddress(ctx, company.id, ADDRESS_B),
  };
}

/** Une adresse au carnet de la société, livrée « avant 10 h » : la saisie de l'équipe l'exige. */
async function bookAddress(
  ctx: E2eContext,
  companyId: string,
  address: typeof ADDRESS_A,
): Promise<string> {
  const created = await staff(ctx)
    .post(`/admin/companies/${companyId}/delivery-addresses`)
    .set(INTENT_KEY, freshIntent())
    .send({
      ...address,
      isDefault: false,
      specs: {
        signatureRequired: null,
        note: "",
        slotList: { mode: "everyday", slots: [] },
        deliveryContact: null,
        gps: null,
        windowMode: "deadline",
        deadlines: { mode: "everyday", times: [DEADLINE] },
      },
    })
    .expect(201);
  return jsonBody<{ id: string }>(created).id;
}

/** L'acheminement d'un corps : le retrait au point, ou la livraison à une adresse du carnet. */
export function pickupAt(decor: BackorderDecor): Record<string, unknown> {
  return {
    fulfillmentMethod: "pickup",
    pickupAddressId: decor.pickupId,
    deliveryAddressId: null,
    deliveryAddress: null,
    requestedWindow: { start: "07:00", end: "08:00" },
  };
}

export function deliveredTo(addressId: string, zone: "A" | "B"): Record<string, unknown> {
  return {
    fulfillmentMethod: "delivery",
    pickupAddressId: null,
    deliveryAddressId: addressId,
    deliveryAddress: zone === "A" ? ADDRESS_A : ADDRESS_B,
    requestedWindow: { start: null, end: DEADLINE },
  };
}

/** La commande d'origine, passée par l'équipe au compte. */
export async function placeOrigin(
  ctx: E2eContext,
  decor: BackorderDecor,
  day: string,
  lines: readonly Record<string, unknown>[],
): Promise<string> {
  return jsonBody<AdminPlacedOrderResponse>(
    await staff(ctx)
      .post("/admin/orders")
      .set(INTENT_KEY, freshIntent())
      .send({
        companyId: decor.companyId,
        buyerUserId: decor.buyerId,
        settlement: "account",
        requestedDeliveryDate: day,
        note: "",
        lines,
        ...pickupAt(decor),
      })
      .expect(201),
  ).id;
}

/** Le reliquat ouvert de l'origine, par son agrégat et le vrai dépôt. */
export async function openBackorder(
  ctx: E2eContext,
  decor: BackorderDecor,
  originOrderId: string,
  lines: readonly { readonly quantity: number; readonly saleUnit: "piece" | "weight" }[],
): Promise<string> {
  const id = `bo_${originOrderId}`;
  await ctx.app.get(BackorderRepository).save(
    Backorder.open({
      id,
      originOrderId,
      companyId: decor.companyId,
      buyerUserId: decor.buyerId,
      lines: lines.map((line) => BackorderLine.of({ sku: SKU, ...line })),
      openedAt: new Date(),
    }),
  );
  return id;
}

/** Le client ne veut pas du reste : abandonné par son agrégat (le geste de l'écran vient en B4). */
export async function abandonBackorder(ctx: E2eContext, backorderId: string): Promise<void> {
  const backorders = ctx.app.get(BackorderRepository);
  const backorder = await backorders.load(backorderId);
  if (backorder === null) {
    throw new RangeError(`reliquat ${backorderId} introuvable`);
  }
  backorder.abandon(new Date(), "staff_autre");
  await backorders.save(backorder);
}

/** Le corps de l'estimation et de la transformation : au compte, le jour donné. */
export function conversionBody(
  decor: BackorderDecor,
  day: string,
  fulfillment: Record<string, unknown> = pickupAt(decor),
): Record<string, unknown> {
  return {
    buyerUserId: decor.buyerId,
    settlement: "account",
    requestedDeliveryDate: day,
    note: "",
    ...fulfillment,
  };
}

export async function quoteBackorder(
  ctx: E2eContext,
  backorderId: string,
  body: Record<string, unknown>,
): Promise<AdminOrderEstimateView> {
  return jsonBody<AdminOrderEstimateView>(
    await staff(ctx).post(`/admin/backorders/${backorderId}/quote`).send(body).expect(200),
  );
}

/** La transformation au total que l'estimation a montré, sous la clé donnée : 201 attendu. */
export async function convertBackorder(
  ctx: E2eContext,
  backorderId: string,
  body: Record<string, unknown>,
  intentKey: string = freshIntent(),
): Promise<AdminPlacedOrderResponse> {
  const quoted = await quoteBackorder(ctx, backorderId, body);
  return jsonBody<AdminPlacedOrderResponse>(
    await staff(ctx)
      .post(`/admin/backorders/${backorderId}/convert`)
      .set(INTENT_KEY, intentKey)
      .send({ ...body, expectedTotalCents: quoted.amounts?.totalCents ?? 0 })
      .expect(201),
  );
}

/** Le prix du catalogue d'aujourd'hui, monté APRÈS la commande d'origine. */
export async function raiseCataloguePrice(ctx: E2eContext, millicents: number): Promise<void> {
  await ctx.prisma.catalogItem.update({
    where: { sku: SKU },
    data: { priceMillicents: millicents },
  });
  ctx.app.get(PricingMaterialsCache).invalidate();
}

/** Ce que la commande a figé : lignes, remise, port, surtaxe, total. */
export function frozenOrder(ctx: E2eContext, orderId: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      subtotalCents: true,
      discountCents: true,
      deliveryFeeCents: true,
      deliveryFeeAdjustment: true,
      freeDeliveryWaivedCents: true,
      deliveryOffered: true,
      lateFeeCents: true,
      totalCents: true,
      revision: true,
      lines: {
        select: {
          sku: true,
          quantity: true,
          saleUnit: true,
          unitPriceMillicents: true,
          lineTotalCents: true,
        },
      },
    },
  });
}
