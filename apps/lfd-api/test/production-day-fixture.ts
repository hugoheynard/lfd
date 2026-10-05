import { randomUUID } from "node:crypto";
import type {
  OpenPackingContainer,
  OpenedPackingContainer,
  PackingSheet,
  ProductionPackingView,
  ProductionWorksheetView,
  WorkshopLine,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { OutboxRelay } from "../src/platform/outbox/outbox-relay.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import {
  bootstrapE2e,
  jsonBody,
  serviceDay,
  type E2eContext,
  type E2eOverride,
} from "./e2e-harness.js";
import { settleCardPayments } from "./card-payments.js";

/**
 * **Une journée de fournil, par l'API** — ce que les suites des fournées
 * partagent : passer des commandes payées, arrêter le plan, lire la fiche et le
 * poste. Tout passe par les vraies routes ; rien n'est semé à la main.
 *
 * Depuis K3c, le poste est celui du colisage : `packing` lit son board,
 * `bagLines` remplit un sac, `closeOrder` déclare prête.
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

/**
 * **Le réveil du relais, qu'une suite peut retenir.** Après chaque validation,
 * le relais part de lui-même livrer ce qui vient d'être écrit : une suite qui
 * veut lire l'état AVANT la réponse d'un abonné perdait la course sur une
 * machine lente (CI du 2026-10-04, « retour en attente »). Fermé, plus rien ne
 * part seul ; `release` rouvre et livre tout. Ouvert par défaut : les autres
 * suites ne voient aucune différence.
 */
export const relayGate: { open: boolean; relay: OutboxRelay | null } = { open: true, relay: null };

/** Rouvre le relais et livre ce qui attendait. */
export async function releaseRelay(ctx: E2eContext): Promise<void> {
  relayGate.open = true;
  await relayGate.relay?.sweep();
  await ctx.drain();
}

/** Boote l'app, jeton staff et passerelle de paiement doublés — le reste est réel. */
export async function bootstrapProductionDay(extra: readonly E2eOverride[] = []): Promise<{
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
      {
        token: OutboxRelayTrigger,
        value: {
          wake: (): void => {
            if (relayGate.open) {
              relayGate.relay?.wake();
            }
          },
        },
      },
      ...extra,
    ],
  });
  relayGate.open = true;
  relayGate.relay = ctx.app.get(OutboxRelay);
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

/**
 * **Le poste de colisage**, tel que le colisage le sert (`GET
 * admin/packing/:date/board`, K3a) — l'ancien poste du fournil est retiré
 * (K3c, `colisage/colisage.md` §17.3).
 */
export async function packing(ctx: E2eContext, day = SERVICE_DAY): Promise<ProductionPackingView> {
  return jsonBody<ProductionPackingView>(
    await ctx.asSub(STAFF).get(`/admin/packing/${day}/board`).expect(200),
  );
}

/** Le bac d'une commande au poste, par sa référence — une référence absente est le bug. */
export async function sheetOf(ctx: E2eContext, reference: string): Promise<PackingSheet> {
  const sheet = (await packing(ctx)).sheets.find((candidate) => candidate.reference === reference);
  if (sheet === undefined) {
    throw new Error(`Le poste du ${SERVICE_DAY} ne porte aucun bac « ${reference} ».`);
  }
  return sheet;
}

/** L'adresse des gestes d'une commande au colisage. */
export function packingOrderPath(orderId: string, day = SERVICE_DAY): string {
  return `/admin/packing/${day}/orders/${orderId}`;
}

/**
 * **Un sac, et des lignes glissées dedans** — le geste du colisage pour un
 * retrait. Sans `lines`, toutes les lignes de la commande, entières. Rend le
 * statut de la DERNIÈRE répartition (204 attendu) : un refus du colisage
 * (« pas encore sorti du four ») est ce que certaines suites éprouvent.
 */
export async function bagLines(
  ctx: E2eContext,
  sheet: Pick<PackingSheet, "orderId" | "lines">,
  lines: readonly { readonly sku: string; readonly quantity: number }[] = sheet.lines,
): Promise<number> {
  const bag = jsonBody<OpenedPackingContainer>(
    await ctx
      .asSub(STAFF)
      .post(`${packingOrderPath(sheet.orderId)}/containers`)
      .send({ nature: "bag" })
      .expect(201),
  );
  let status = 204;
  for (const line of lines) {
    const response = await ctx
      .asSub(STAFF)
      .post(`${packingOrderPath(sheet.orderId)}/containers/${bag.containerId}/lines/${line.sku}`)
      .send({ quantity: line.quantity });
    status = response.status;
  }
  return status;
}

/** Ce qu'il faut pour coliser une commande d'une suite : sa fiche staff, son jour, son contenant. */
export interface PackingTarget {
  readonly staff: string;
  readonly day: string;
  readonly orderId: string;
  readonly container: OpenPackingContainer;
}

/**
 * **Une commande remplie au colisage, sans la fermer** : un contenant ouvert
 * (un sac pour un retrait, un bac pour une livraison), toutes ses lignes
 * glissées dedans. Rend le bac de livraison né au colisage, s'il y en a.
 */
export async function fillOrder(ctx: E2eContext, order: PackingTarget): Promise<string | null> {
  const agent = () => ctx.asSub(order.staff);
  const path = packingOrderPath(order.orderId, order.day);
  const sheetOfOrder = async (): Promise<PackingSheet | undefined> =>
    jsonBody<ProductionPackingView>(
      await agent().get(`/admin/packing/${order.day}/board`).expect(200),
    ).sheets.find((candidate) => candidate.orderId === order.orderId);
  const sheet = await sheetOfOrder();
  if (sheet === undefined) {
    throw new Error(`La commande ${order.orderId} n'est pas au colisage du ${order.day}.`);
  }
  const opened = jsonBody<OpenedPackingContainer>(
    await agent().post(`${path}/containers`).send(order.container).expect(201),
  );
  for (const line of sheet.lines) {
    await agent()
      .post(`${path}/containers/${opened.containerId}/lines/${line.sku}`)
      .send({ quantity: line.quantity })
      .expect(204);
  }
  const filled = await sheetOfOrder();
  const container = filled?.containerList?.find((entry) => entry.id === opened.containerId);
  return container?.binId ?? null;
}

/**
 * **Une commande colisée de bout en bout, au colisage** : remplie
 * ({@link fillOrder}), puis déclarée prête. Pour les suites dont le sujet n'est
 * pas le colisage mais ce qu'il déclenche — avec leur propre jour et leur
 * propre fiche staff.
 */
export async function coliseOrder(ctx: E2eContext, order: PackingTarget): Promise<string | null> {
  const binId = await fillOrder(ctx, order);
  await ctx
    .asSub(order.staff)
    .post(`${packingOrderPath(order.orderId, order.day)}/close`)
    .expect(204);
  return binId;
}

/** « Déclarer prête » au colisage, et rend le statut HTTP. */
export async function closeOrder(ctx: E2eContext, orderId: string): Promise<number> {
  return (await ctx.asSub(STAFF).post(`${packingOrderPath(orderId)}/close`)).status;
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
