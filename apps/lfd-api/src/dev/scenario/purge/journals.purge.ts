import { SEED_STAFF_SUB } from "../../seeding/order-placing.seed.js";
import type { PurgeClient, ScenarioScope } from "./scenario-scope.js";

/** Les modèles de courrier que la vie d'une commande envoie au client. */
const ORDER_MAIL_TEMPLATE_PREFIX = "customer.order-";

/**
 * **Les journaux que le scénario a écrits** : le journal d'activité de ses
 * commandes, bacs, tournées et journées, et le registre des courriers qu'elles
 * ont envoyés à ses acheteurs.
 *
 * Le journal est append-only par nature et on ne l'efface nulle part ailleurs —
 * mais ses lignes décrivent ici des commandes qui n'existent plus, sur une base
 * de démonstration (même raison que `trimPricing`, dans `reset.seed.ts`).
 *
 * Ce qui en relève, relu le 2026-10-05 dans les charges écrites :
 *
 * - une commande, par sa charge (`orderId`, ou `order.id` pour les faits de
 *   bac et d'arrêt) ou comme sujet (`delivery_bin.declared`, contenants) ;
 * - une tournée du scénario, comme sujet ;
 * - une journée du scénario (`production_day.closed`, par `serviceDay`), et
 *   sa composition automatique à l'arrêt du plan (`delivery_day`, 2026-10-07) ;
 * - les deux réglages que le scénario rejoue à chaque passage : le départ
 *   (`delivery_departure.chosen`, par le semis) et l'adresse de ses clients
 *   réalignée (`company.delivery_address_updated`, par leurs acheteurs).
 *
 * En SQL : le filtre lit la charge JSON sur plusieurs chemins, ce que le client
 * Prisma ne sait exprimer qu'en une clause par commande et par chemin.
 */
export async function purgeJournals(
  tx: PurgeClient,
  scope: ScenarioScope,
  roundIds: readonly string[],
): Promise<number> {
  const orders = [...scope.orderIds];
  const rounds = [...roundIds];
  const days = [...scope.days];
  const companies = [...scope.companyIds];
  const users = [...scope.userIds];
  const activity = await tx.$executeRaw`
    DELETE FROM growth.activity_events
     WHERE payload->>'orderId' = ANY(${orders})
        OR payload->'order'->>'id' = ANY(${orders})
        OR (subject_type = 'order' AND subject_id = ANY(${orders}))
        OR (subject_type = 'delivery_round' AND subject_id = ANY(${rounds}))
        OR (subject_type = 'production_day' AND payload->>'serviceDay' = ANY(${days}))
        OR (subject_type = 'delivery_day' AND subject_id = ANY(${days}))
        OR (type = 'delivery_departure.chosen' AND actor_id = ${SEED_STAFF_SUB})
        OR (type = 'company.delivery_address_updated'
            AND subject_id = ANY(${companies}) AND actor_id = ANY(${users}))`;
  const buyers = await tx.user.findMany({
    where: { id: { in: users } },
    select: { email: true },
  });
  const mails = await tx.mailSend.deleteMany({
    where: {
      recipient: { in: buyers.map((buyer) => buyer.email) },
      template: { startsWith: ORDER_MAIL_TEMPLATE_PREFIX },
    },
  });
  return activity + mails.count;
}
