/**
 * Les fixtures partagées par les deux suites e2e du **calculateur de tournée**
 * (plan de tournée, lot 7) : le parcours (`delivery-routing.e2e-spec.ts`) et
 * les gardes (`delivery-routing-guards.e2e-spec.ts`). Elles s'appuient sur
 * celles de la composition : on propose sur ce qu'on sait composer.
 *
 * 🔴 Aucun réseau : sans `BAN_GEOCODER_URL`, le géocodeur est éteint. Les
 * points viennent du CARNET — une adresse de société avec son point GPS, que
 * la commande relie —, et le point de départ est un point de retrait situé.
 */
import type {
  ApplyDeliveryProposalPayload,
  DeliveryRoundProposalView,
  DeliveryRoundTimingView,
  TimeDeliveryRoundsPayload,
} from "@lfd/contracts";
import type request from "supertest";

import {
  StraightLineDistanceMatrix,
  StraightRouteGeometry,
} from "../src/delivery/domain/ports/__tests__/road-routing-doubles.js";
import { DistanceMatrix } from "../src/delivery/domain/ports/distance-matrix.js";
import { RouteGeometry } from "../src/delivery/domain/ports/route-geometry.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { type E2eOverride, jsonBody, type E2eContext } from "./e2e-harness.js";
import { binTypeId, LOADING } from "./delivery-loading-scene.js";
import { admin, ROUNDS } from "./delivery-rounds-scene.js";
import { attachTo, createCompany, createUser } from "./factories.js";

export const PROPOSAL = `${ROUNDS}/proposition`;
export const TIMING = `${PROPOSAL}/chronometrer`;

/**
 * **La carte routière, doublée** (L10b-C5) — une frontière SORTANTE, comme
 * Auth0 et R2 : OSRM est un service distant, et ce n'est pas ce qu'un e2e
 * éprouve. Sans elle, « Proposer » refuse depuis que le vol d'oiseau a
 * disparu (`delivery-road-routing.e2e-spec.ts` le prouve). Tout le reste —
 * lectures, murs, versions, écriture — reste le vrai SQL.
 */
export const ROAD_ROUTING_OVERRIDES: readonly E2eOverride[] = [
  { token: DistanceMatrix, value: new StraightLineDistanceMatrix() },
  { token: RouteGeometry, value: new StraightRouteGeometry() },
];

/** Le laboratoire, à Chambéry : le départ de toutes les tournées. */
export async function seedDeparture(ctx: E2eContext, gps: boolean = true): Promise<void> {
  await ctx.prisma.pickupAddress.create({
    data: {
      label: "Laboratoire",
      ligne1: "1 rue du Four",
      codePostal: "73000",
      ville: "Chambéry",
      pays: "France",
      isDefault: true,
      ...(gps ? { gps: { lat: 45.5646, lng: 5.9178 } } : {}),
    },
  });
}

/** Des cotes utiles quelconques : « Proposer » exige un véhicule mesuré (CA-D3). */
export const MEASURED = { lengthCm: 250, widthCm: 160, heightCm: 140 } as const;

/**
 * Le produit des livraisons qu'on propose : depuis CA4, une commande dont on
 * ne sait pas les bacs n'est jamais placée, et le Bac M en contient dix.
 */
export const BREAD_SKU = "PAIN-ROUTING";
export const BREAD_PER_BIN = 10;

/**
 * Le catalogue minimal : « Proposer » exige un type de bac en service
 * (CA-D3), et une contenance pour estimer les bacs (CA4) — posée par la
 * vraie route de la grille.
 */
export async function seedBinCatalog(ctx: E2eContext): Promise<string> {
  const typeId = await binTypeId(ctx);
  await admin(ctx)
    .put(`${LOADING}/contenances`)
    .send({ binTypeId: typeId, sku: BREAD_SKU, units: BREAD_PER_BIN })
    .expect(204);
  return typeId;
}

/**
 * Pose `quantity` pains sur une commande semée. Écrit en Prisma, comme la
 * commande elle-même : le commerce n'a pas d'agrégat de ligne à qui le
 * demander hors d'une passation complète — dette de `test/factories.ts`.
 */
export async function withBread(ctx: E2eContext, orderId: string, quantity = 1): Promise<void> {
  await ctx.prisma.orderLine.create({
    data: {
      orderId,
      sku: BREAD_SKU,
      productNameSnapshot: "Pain",
      unitPriceMillicents: 100_000,
      quantity,
      lineTotalCents: quantity * 100,
    },
  });
}

/**
 * `seedLocatedDelivery`, avec un pain : une livraison dont « Proposer » sait
 * la demande — un Bac M estimé (CA4).
 */
export async function seedPlannableDelivery(
  ctx: E2eContext,
  day: string,
  gps: { readonly lat: number; readonly lng: number } | null,
  stopMinutes?: number,
): Promise<string> {
  const orderId = await seedLocatedDelivery(ctx, day, gps, stopMinutes);
  await withBread(ctx, orderId);
  return orderId;
}

let sequence = 0;

/** Oublie les numéros semés : `ctx.reset()` a tout effacé. */
export function forgetRoutingScene(): void {
  sequence = 0;
}

/**
 * Une commande en livraison ce jour-là, reliée à une adresse du carnet de SA
 * société — avec un point GPS (`gps`), ou sans (`null`), et, si on le donne,
 * un temps de livraison sur place propre à l'adresse (L7b-C4). Rend son id.
 */
export async function seedLocatedDelivery(
  ctx: E2eContext,
  day: string,
  gps: { readonly lat: number; readonly lng: number } | null,
  stopMinutes?: number,
): Promise<string> {
  sequence += 1;
  const n = String(sequence);
  const owner = await createUser(ctx.prisma, {
    auth0Sub: `auth0|routing-${n}`,
    email: `r${n}@col.fr`,
  });
  const company = await createCompany(ctx.prisma, {
    status: "active",
    raisonSociale: `Maison ${n}`,
  });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  const site = {
    label: `Site ${n}`,
    ligne1: `${n} rue des Alpes`,
    ligne2: "",
    codePostal: "73000",
    ville: "Chambéry",
    pays: "France",
  };
  const address = await ctx.prisma.address.create({
    data: {
      ...site,
      companyId: company.id,
      kind: "delivery",
      isDefault: true,
      deliverySpecs: {
        note: "",
        slotList: { mode: "everyday", slots: [] },
        deliveryContact: null,
        gps,
        signatureRequired: null,
        ...(stopMinutes === undefined ? {} : { stopMinutes }),
      },
    },
    select: { id: true },
  });
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: `TRN-${n.padStart(4, "0")}`,
      placedByUserId: owner.id,
      companyId: company.id,
      clientele: "pro",
      status: "placed",
      paymentStatus: "not_required",
      // La clé de journée du commerce : minuit UTC, comme `expectedOnWhere`.
      requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
      fulfillmentMethod: "delivery",
      deliveryAddressId: address.id,
      deliveryAddressSnapshot: site,
      subtotalCents: 1000,
      totalCents: 1200,
    },
    select: { id: true },
  });
  return order.id;
}

export async function propose(ctx: E2eContext, query: string): Promise<DeliveryRoundProposalView> {
  return jsonBody<DeliveryRoundProposalView>(
    await admin(ctx).get(`${PROPOSAL}?${query}`).expect(200),
  );
}

/** La proposition renvoyée TELLE QU'ON L'A VUE : ce que ferait l'écran. */
export function payloadOf(view: DeliveryRoundProposalView): ApplyDeliveryProposalPayload {
  return {
    day: view.day,
    rounds: view.rounds.map((round) => ({
      roundId: round.roundId,
      vehicleId: round.vehicleId,
      orderIds: round.stops.map((stop) => stop.orderId),
    })),
    versions: view.versions.map(({ roundId, version }) => ({ roundId, version })),
  };
}

export function apply(ctx: E2eContext, payload: ApplyDeliveryProposalPayload): request.Test {
  return admin(ctx).post(PROPOSAL).send(payload);
}

/** « Chronométrer » une composition — ce que fait l'écran après un glisser-déposer. */
export function time(ctx: E2eContext, payload: TimeDeliveryRoundsPayload): request.Test {
  return admin(ctx).post(TIMING).send(payload);
}

export async function timed(
  ctx: E2eContext,
  payload: TimeDeliveryRoundsPayload,
): Promise<DeliveryRoundTimingView> {
  return jsonBody<DeliveryRoundTimingView>(await time(ctx, payload).expect(200));
}
