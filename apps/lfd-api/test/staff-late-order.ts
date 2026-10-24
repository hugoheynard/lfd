import { randomUUID } from "node:crypto";

import type { AdminPlacedOrderResponse } from "@lfd/contracts";

import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/**
 * **La retardataire, par la vraie porte** (lot O3,
 * `documentation/commandes/passation/plan-reglages-commandes.md` §8.3, Hugo 2026-10-14).
 *
 * Depuis O3, un CLIENT ne passe plus commande sur une journée dont le plan est
 * arrêté ; seule la saisie de l'ÉQUIPE y est reçue, marquée « hors plan ». Les
 * suites qui éprouvent l'écart, le retirage ou la re-clôture sèment donc leur
 * commande tardive ici — par `POST /admin/orders`, jamais par écriture directe
 * en base : c'est le seul chemin par lequel la production en verra.
 *
 * Le client est une société au compte (mensuel) : la commande est
 * `not_required`, comptée par le fournil comme une commande réglée.
 */

const LATE_BUYER_SUB = "auth0|retardataire-e2e";

/** La société et son acheteur, créés une fois par remise à zéro de la base. */
export async function lateBuyer(
  ctx: E2eContext,
): Promise<{ readonly companyId: string; readonly buyerUserId: string }> {
  const known = await ctx.prisma.user.findFirst({
    where: { auth0Sub: LATE_BUYER_SUB },
    select: { id: true, memberships: { select: { companyId: true } } },
  });
  const companyId = known?.memberships[0]?.companyId;
  if (known !== null && companyId !== undefined) {
    return { companyId, buyerUserId: known.id };
  }
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const buyer = await createUser(ctx.prisma, {
    auth0Sub: LATE_BUYER_SUB,
    email: "retardataire@test.fr",
  });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  return { companyId: company.id, buyerUserId: buyer.id };
}

/**
 * Une commande de retrait saisie par l'équipe pour `day` — reçue même si le
 * plan est arrêté. Le point de retrait est le premier du site, créé par la
 * suite appelante.
 */
export async function placeLateByStaff(
  ctx: E2eContext,
  day: string,
  lines: readonly { sku: string; quantity: number }[],
): Promise<AdminPlacedOrderResponse> {
  const point = await ctx.prisma.site.findFirstOrThrow({ select: { id: true } });
  return placeByStaff(ctx, {
    requestedDeliveryDate: day,
    fulfillmentMethod: "pickup",
    pickupAddressId: point.id,
    requestedWindow: { start: "07:00", end: "08:00" },
    lines,
  });
}

/** Ouvre le règlement au compte (mensuel) à une société semée par la suite. */
export async function grantAccount(ctx: E2eContext, companyId: string): Promise<void> {
  await ctx.prisma.company.update({
    where: { id: companyId },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
}

/** La saisie de l'équipe, corps libre (acheminement compris), au compte. */
export async function placeByStaff(
  ctx: E2eContext,
  body: Record<string, unknown>,
  buyer?: { readonly companyId: string; readonly buyerUserId: string },
): Promise<AdminPlacedOrderResponse> {
  const who = buyer ?? (await lateBuyer(ctx));
  const response = await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/orders")
    .send({ idempotencyKey: randomUUID(), settlement: "account", note: "", ...who, ...body });
  // Le corps dans l'échec : un refus nomme sa cause, le statut seul non.
  expect({
    status: response.status,
    body: response.status === 201 ? null : (response.body as unknown),
  }).toEqual({ status: 201, body: null });
  return jsonBody<AdminPlacedOrderResponse>(response);
}
