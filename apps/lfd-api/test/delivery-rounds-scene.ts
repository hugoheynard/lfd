/**
 * Les fixtures partagées par les deux suites e2e de la **composition des
 * tournées** : le parcours (`delivery-rounds.e2e-spec.ts`) et les gardes
 * (`delivery-rounds-guards.e2e-spec.ts`) — plan de tournée, lot 3.
 *
 * Rien ici ne boote l'application. Les commandes passent par le vrai chemin
 * (`placeOrder`, plan T, 2026-10-25) : livrées à Val-d'Isère, au compte, sur
 * l'échéance de l'adresse du carnet.
 */
import {
  addDays,
  type CreatedIdResponse,
  type DeliveryRoundsDayView,
  type DeliveryRoundView,
} from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { E2E_STAFF_ID, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { placeOrder, placeOrderForCustomer, type OrderLineSeed } from "./order-factory.js";

export const ROUNDS = "/admin/delivery/rounds";
export const VEHICLES = "/admin/delivery/vehicles";

/** Le jeton porteur EST le `sub` : chaque rôle est une vraie fiche en base. */
export const ADMIN_VERIFIER_OVERRIDE = {
  token: AdminTokenVerifier,
  value: {
    verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
      Promise.resolve({ subject: token, scopes: [] }),
  },
};

export function admin(ctx: E2eContext): request.Agent {
  return ctx.asSub(E2E_STAFF_SUB);
}

let plateSeq = 0;

/**
 * Un véhicule, par la route de la flotte — avec ses cotes si on les donne :
 * « Proposer » en exige au moins un (CA-D3).
 */
export async function addVehicle(
  ctx: E2eContext,
  name: string,
  cargo?: { readonly lengthCm: number; readonly widthCm: number; readonly heightCm: number },
): Promise<string> {
  plateSeq += 1;
  const plate = `AB-${String(100 + plateSeq)}-CD`;
  const response = await admin(ctx)
    .post(VEHICLES)
    .send({ name, plate, ...(cargo === undefined ? {} : { cargo }) })
    .expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

/** Le client qui commande les livraisons du test : un pro au compte, son adresse au carnet. */
interface DeliveryCustomer {
  readonly userId: string;
  readonly companyId: string;
  readonly addressId: string;
}

let customer: DeliveryCustomer | null = null;

/** Oublie le client semé : `ctx.reset()` l'a effacé. */
export function forgetCustomer(): void {
  customer = null;
}

const COURIER_ADDRESS = {
  label: "",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};
/** L'échéance inscrite sur l'adresse : un pro ne demande qu'elle. */
const DEADLINE = "10:00";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Trois jours avant le jour de service : l'heure limite est loin. */
const LEAD_DAYS = 3;

/**
 * Le client des livraisons, semé une fois par test : la zone de Val-d'Isère,
 * une société au compte, son détenteur, et l'adresse de son carnet — posée par
 * sa route, avec son échéance.
 */
async function deliveryCustomer(ctx: E2eContext): Promise<DeliveryCustomer> {
  if (customer !== null) {
    return customer;
  }
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 0 },
  });
  const company = await createCompany(ctx.prisma, { raisonSociale: "Chalet des Tournées" });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: "auth0|rounds", email: "r@col.fr" });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  const booked = await ctx
    .asSub("auth0|rounds")
    .post(`/companies/${company.id}/delivery-addresses`)
    .send({
      ...COURIER_ADDRESS,
      isDefault: true,
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
  customer = {
    userId: user.id,
    companyId: company.id,
    addressId: jsonBody<{ id: string }>(booked).id,
  };
  return customer;
}

/** Ce qu'une suite peut imposer à une livraison semée. */
export interface DeliverySeedOptions {
  /** Absentes = cinq croissants. */
  readonly lines?: readonly OrderLineSeed[];
  /**
   * Saisie par l'équipe : seule une saisie entre encore dans un jour dont le
   * plan est arrêté (une commande absorbée par le retirage).
   */
  readonly byStaff?: boolean;
}

/**
 * Une commande en livraison pour ce jour, passée au compte par le vrai chemin
 * (`placeOrder`, plan T) ; rend son id et son numéro. Un jour proche se
 * commande trois jours plus tôt (antidatée : l'heure limite se juge alors).
 */
export async function seedDelivery(
  ctx: E2eContext,
  day: string,
  options: DeliverySeedOptions = {},
): Promise<{ readonly id: string; readonly reference: string }> {
  const buyer = await deliveryCustomer(ctx);
  const placedAt = new Date(`${addDays(day, -LEAD_DAYS)}T08:00:00.000Z`);
  const content = {
    buyerUserId: buyer.userId,
    companyId: buyer.companyId,
    forDay: day,
    // On ne passe pas une commande dans le futur.
    ...(placedAt.getTime() < Date.now() - DAY_MS ? { placedAt } : {}),
    window: { start: null, end: DEADLINE },
    fulfillment: {
      method: "delivery" as const,
      address: COURIER_ADDRESS,
      addressId: buyer.addressId,
    },
    lines: options.lines ?? [{ sku: "VIE-001", quantity: 5 }],
  };
  const order =
    options.byStaff === true
      ? await placeOrderForCustomer(ctx, {
          ...content,
          staffUserId: E2E_STAFF_ID,
          settlement: "account",
        })
      : await placeOrder(ctx, { ...content, settlement: "account" });
  return { id: order.id, reference: order.orderNumber };
}

export async function openRound(ctx: E2eContext, day: string, vehicleId: string): Promise<string> {
  const response = await admin(ctx).post(ROUNDS).send({ day, vehicleId }).expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

export async function dayView(ctx: E2eContext, day: string): Promise<DeliveryRoundsDayView> {
  return jsonBody<DeliveryRoundsDayView>(await admin(ctx).get(`${ROUNDS}?day=${day}`).expect(200));
}

export async function roundOf(
  ctx: E2eContext,
  day: string,
  roundId: string,
): Promise<DeliveryRoundView> {
  const found = (await dayView(ctx, day)).rounds.find((round) => round.id === roundId);
  if (found === undefined) {
    throw new TypeError(`tournée ${roundId} absente du ${day}`);
  }
  return found;
}

/** Affecte à la version courante ; rend l'arrêt. */
export async function assign(
  ctx: E2eContext,
  day: string,
  roundId: string,
  orderId: string,
): Promise<string> {
  const { version } = await roundOf(ctx, day, roundId);
  const response = await admin(ctx)
    .post(`${ROUNDS}/${roundId}/stops`)
    .send({ orderId, version })
    .expect(201);
  return jsonBody<{ stopId: string }>(response).stopId;
}
