import type { Prisma } from "../../../platform/database/client/client.js";

/**
 * **L'assiette, écrite une seule fois** : « cette commande a été passée au
 * compte pendant `[from, to[` ».
 *
 * ## Les quatre critères, et ce que chacun évite
 *
 * | Critère                        | Ce qu'il évite                                                  |
 * | ------------------------------ | ---------------------------------------------------------------- |
 * | `payment_status='not_required'`| prélever ce qui a déjà été réglé par carte                      |
 * | `total_cents > 0`              | 🔴 les commandes GRATUITES, qui sont aussi `not_required`        |
 * | `status <> 'cancelled'`        | prélever ce qui n'a rien produit                                |
 * | `created_at` dans la fenêtre   | compter deux fois, ou perdre, une commande de bord de cycle     |
 *
 * 🔴 `total_cents > 0` n'est PAS une optimisation. `Order.deferPayment()` est
 * appelé dès que `requiresCard && totalCents > 0` est faux : **toute commande à
 * zéro euro devient `not_required`**, terme ou pas. Sans cette borne, des
 * commandes gratuites entreraient dans le lot, dans le relevé du client et dans
 * l'export du comptable (vérifié le 2026-09-10 dans `place-order.handler.ts`).
 *
 * Avec elle, l'équivalence est exacte : `not_required ∧ total > 0` **si et
 * seulement si** la commande a été passée au compte. `company_id IS NOT NULL`
 * en découle — le compte se refuse à qui n'a pas de société.
 *
 * Les deux premiers critères sont la traduction SQL du régime `account` de
 * `settlementRegimeOf` (`b2b/orders/domain/services/settlement-regime.ts`),
 * que la fiche de commande et les courriels lisent. Les deux changent ensemble.
 *
 * ⚠️ Le terme mensuel de la société n'est **délibérément pas** consulté. Ce qui
 * rend une commande prélevable est la décision prise à SA passation, que la
 * commande porte déjà. Évaluer le crédit de la société à la clôture ferait
 * disparaître de l'assiette un mois de commandes livrées dès qu'on coupe un
 * client — c'est-à-dire précisément celui qu'on venait de couper (décision de
 * Hugo, 2026-09-10).
 *
 * Sorti de `PrismaBillableOrdersReader` le 2026-10-05 : le relevé de cycle lit
 * les mêmes commandes une par une, et un relevé qui ne retomberait pas sur
 * l'assiette ne servirait pas à rapprocher le prélèvement. Deux copies du
 * critère auraient fini par diverger — c'est ce que la §1.1 du plan
 * `agregation-des-commandes` interdit.
 */
export function billableOrderWhere(from: Date, to: Date): Prisma.OrderWhereInput {
  return {
    paymentStatus: "not_required",
    totalCents: { gt: 0 },
    status: { not: "cancelled" },
    companyId: { not: null },
    createdAt: { gte: from, lt: to },
  };
}
