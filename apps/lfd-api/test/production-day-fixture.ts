import { randomUUID } from "node:crypto";
import type { ProductionPackingView, ProductionWorksheetView, WorkshopLine } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { settleCardPayments } from "./card-payments.js";

/**
 * **Une journée de fournil, par l'API** — ce que les suites des fournées
 * partagent : passer des commandes payées, arrêter le plan, lire la fiche et le
 * poste. Tout passe par les vraies routes ; rien n'est semé à la main, sauf ce
 * que chaque suite dit explicitement faire à la place de l'ANCIEN binaire.
 *
 * Même mécanique que `production-packing.e2e-spec.ts`, factorisée pour deux
 * suites plutôt que recopiée une troisième fois.
 */

export const MEMBER = "auth0|member";
export const STAFF = "staff-e2e";
/** Le croissant du catalogue de test — `VIE-001`, « Croissant ». */
export const CROISSANT = "VIE-001";

const SITE = {
  label: "Boutique",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Boote l'app, jeton staff et passerelle de paiement doublés — le reste est réel. */
export async function bootstrapProductionDay(): Promise<{
  readonly ctx: E2eContext;
  readonly issued: string[];
}> {
  const issued: string[] = [];
  let count = 0;
  const ctx = await bootstrapE2e({
    overrides: [
      {
        token: AdminTokenVerifier,
        value: {
          verify: (): Promise<{ subject: string; scopes: string[] }> =>
            Promise.resolve({ subject: STAFF, scopes: [] }),
        },
      },
      {
        token: PaymentGateway,
        value: {
          createIntent: () => {
            count += 1;
            const id = `pi_e2e_${String(count)}`;
            issued.push(id);
            return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
          },
          publishableKey: () => "pk_e2e",
          parseWebhook: () => ({ kind: "ignored" as const }),
          cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
        },
      },
    ],
  });
  return { ctx, issued };
}

/** Le jour servi par défaut : dans une semaine, jamais une date du calendrier. */
export const SERVICE_DAY = serviceDay();

/** Passe une commande de retrait PAYÉE pour la journée servie. */
export async function place(
  ctx: E2eContext,
  issued: string[],
  lines: readonly { sku: string; quantity: number }[],
): Promise<void> {
  const point = await ctx.prisma.pickupAddress.findFirst({ select: { id: true } });
  const id =
    point?.id ?? (await ctx.prisma.pickupAddress.create({ data: { ...SITE, isDefault: true } })).id;
  await ctx
    .asSub(MEMBER)
    .post(`/orders`)
    .send({
      idempotencyKey: randomUUID(),
      companyId: null,
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "pickup",
      pickupAddressId: id,
      note: "",
      lines,
    })
    .expect(201);
  await settleCardPayments(ctx, issued);
}

export async function closePlan(ctx: E2eContext): Promise<void> {
  await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/close`).expect(201);
}

/**
 * **La journée, colisée par l'ANCIEN poste** — telle qu'une journée arrêtée
 * avant la bascule du colisage (plan `colisage/plan-domaine-colisage.md`, K2).
 *
 * Une écriture en base, et c'est délibéré : depuis K2, aucune clôture ne fait
 * plus naître de journée `legacy` (« on bascule direct », Hugo, 2026-10-04),
 * mais le binaire sert encore celles qui le sont. Les suites qui éprouvent
 * l'ancien poste les reconstituent ainsi ; aucune autre colonne n'est touchée.
 */
export async function asLegacyPacking(ctx: E2eContext, day = SERVICE_DAY): Promise<void> {
  // `updateMany` : une clôture refusée (journée vide) n'a pas de ligne, et le
  // refus est ce que la suite éprouve.
  await ctx.prisma.productionDay.updateMany({
    where: { serviceDay: day },
    data: { packingOwner: "legacy" },
  });
}

/** Arrête le plan, puis le rend à l'ancien poste — cf. {@link asLegacyPacking}. */
export async function closeLegacyPlan(ctx: E2eContext): Promise<void> {
  await closePlan(ctx);
  await asLegacyPacking(ctx);
}

export async function retake(ctx: E2eContext): Promise<void> {
  await ctx.asSub(STAFF).post(`/admin/production/worksheet/${SERVICE_DAY}/retake`).expect(201);
}

/** Déclare une fournée, et rend le statut HTTP. */
export async function recordBatch(
  ctx: E2eContext,
  id: string,
  quantity: number,
  sku = CROISSANT,
): Promise<number> {
  const response = await ctx
    .asSub(STAFF)
    .put(`/admin/production/worksheet/${SERVICE_DAY}/lines/${sku}/batches/${id}`)
    .send({ quantity, initials: "KA" });
  return response.status;
}

export async function cancelBatch(ctx: E2eContext, id: string): Promise<number> {
  const response = await ctx
    .asSub(STAFF)
    .delete(`/admin/production/worksheet/${SERVICE_DAY}/batches/${id}`);
  return response.status;
}

/** L'ancienne case : rendre la ligne complète. */
export async function markLine(ctx: E2eContext, sku = CROISSANT): Promise<number> {
  const response = await ctx
    .asSub(STAFF)
    .put(`/admin/production/worksheet/${SERVICE_DAY}/lines/${sku}/done`)
    .send({ initials: "MB" });
  return response.status;
}

/** Met une ligne au bac, et rend le statut HTTP. */
export async function pack(ctx: E2eContext, reference: string, sku = CROISSANT): Promise<number> {
  const response = await ctx
    .asSub(STAFF)
    .put(`/admin/production/packing/${SERVICE_DAY}/sheets/${reference}/lines/${sku}`)
    .send({ initials: "MB" });
  return response.status;
}

export async function packing(ctx: E2eContext): Promise<ProductionPackingView> {
  return jsonBody<ProductionPackingView>(
    await ctx.asSub(STAFF).get(`/admin/production/packing?date=${SERVICE_DAY}`).expect(200),
  );
}

/** La ligne de la fiche d'atelier pour un SKU — une fiche qui l'ignore est le bug. */
export async function worksheetLine(ctx: E2eContext, sku = CROISSANT): Promise<WorkshopLine> {
  const view = jsonBody<ProductionWorksheetView>(
    await ctx.asSub(STAFF).get(`/admin/production/worksheet?date=${SERVICE_DAY}`).expect(200),
  );
  const found = view.groups.flatMap((group) => group.lines).find((entry) => entry.sku === sku);
  if (found === undefined) {
    throw new Error(`La fiche du ${SERVICE_DAY} ne porte aucune ligne « ${sku} ».`);
  }
  return found;
}

/** Les références des bacs du jour, dans l'ordre du poste. */
export async function references(ctx: E2eContext): Promise<readonly string[]> {
  return (await packing(ctx)).sheets.map((sheet) => sheet.reference);
}

/** Les fournées du jour telles que la base les porte — ce qu'aucune route ne liste. */
export async function storedBatches(
  ctx: E2eContext,
): Promise<readonly { id: string; quantity: number; cancelledAt: Date | null }[]> {
  return ctx.prisma.productionBatch.findMany({
    where: { serviceDay: SERVICE_DAY },
    select: { id: true, quantity: true, cancelledAt: true },
    orderBy: { recordedAt: "asc" },
  });
}
