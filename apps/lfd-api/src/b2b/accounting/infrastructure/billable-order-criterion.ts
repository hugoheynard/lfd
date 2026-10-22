import { instantToLocal } from "@lfd/contracts";

import type { Prisma } from "../../../platform/database/client/client.js";

/**
 * **L'assiette, écrite une seule fois** : « ce bon passé au compte a été
 * LIVRÉ pendant `[from, to[` » — jour de livraison, pas jour de commande,
 * depuis le lot ZL (plan `plan-zero-faille.md`, §12, Hugo 2026-10-22).
 *
 * ## Les cinq critères, et ce que chacun évite
 *
 * | Critère                        | Ce qu'il évite                                                  |
 * | ------------------------------ | ---------------------------------------------------------------- |
 * | `payment_status='not_required'`| prélever ce qui a déjà été réglé par carte                      |
 * | `total_cents > 0`              | 🔴 les commandes GRATUITES, qui sont aussi `not_required`        |
 * | `status <> 'cancelled'`        | prélever ce qui n'a rien produit                                |
 * | `company_id IS NOT NULL`       | un bon sans société, que le compte refuse de toute façon        |
 * | `delivered_on` dans la fenêtre | facturer un bon pas encore livré, ou dans le mauvais mois       |
 *
 * ## Pourquoi la livraison, et pas la commande
 *
 * Pour une livraison de biens, le fait générateur ET l'exigibilité de la TVA
 * sont la livraison (CGI art. 269-1-a et 269-2-a), et une facture
 * récapitulative couvre les livraisons d'un mois civil (CGI art. 289-I-3).
 * Sous `created_at`, un bon commandé le 30 pour le 5 tombait dans la facture
 * du mois de sa commande. `delivered_on` est posé une fois, à la première
 * remise attestée (`RecordDeliveryDayOnHandover`) : un bon non livré n'est
 * dans AUCUNE assiette — il n'est ni facturé, ni prélevé, et figure dans les
 * « Bons à constater » une fois son jour passé.
 *
 * ## Jour à jour, à Paris
 *
 * `delivered_on` est un JOUR de Paris (`@db.Date`) ; les bornes sont des
 * instants (une clôture est un minuit de Paris, le plancher peut tomber en
 * journée). On compare donc des jours : `[jour(from), jour(to)[`, chacun lu à
 * Paris. Une clôture du 1er novembre à 00h00 exclut le 1er et garde le 31.
 *
 * ## « Jamais facturé », « jamais prélevé » : PAS ici
 *
 * La facture lit `[plancher, clôture[` et retire en mémoire les bons qui ont
 * déjà une ligne `invoice_order` 380 (`PrismaMonthlyInvoicingReader`) ; le
 * lot lit la même fenêtre et retire ceux dont l'encaissement n'est plus
 * ouvert. C'est ce qui fait partir un bon livré le 31 mais constaté le 1er
 * dans la facture suivante (Q-L2), sans le perdre ni le compter deux fois
 * (index unique `invoice_order_invoiced_once`). Mis ici, « jamais facturé »
 * viderait le lot : il se constitue APRÈS la facture, sur des bons facturés.
 *
 * 🔴 `total_cents > 0` n'est PAS une optimisation. `Order.deferPayment()` est
 * appelé dès que `requiresCard && totalCents > 0` est faux : **toute commande à
 * zéro euro devient `not_required`**, terme ou pas (vérifié le 2026-09-10 dans
 * `place-order.handler.ts`).
 *
 * Les deux premiers critères sont la traduction SQL du régime `account` de
 * `settlementRegimeOf` (`b2b/orders/domain/services/settlement-regime.ts`),
 * que la fiche de commande et les courriels lisent. Les deux changent ensemble.
 *
 * ⚠️ Le terme mensuel de la société n'est **délibérément pas** consulté : ce
 * qui rend une commande prélevable est la décision prise à SA passation
 * (décision de Hugo, 2026-09-10).
 *
 * Partagé par les lecteurs de l'assiette — la facture, l'aperçu du lot, la
 * constitution et l'état d'encaissement (relu le 2026-10-22) : deux copies du
 * critère finiraient par diverger. Le relevé et le dossier n'y lisent plus
 * une fenêtre : ils suivent la facture (`cycle-order-membership.ts`), et
 * partagent `accountOrderWhere`.
 */
export function billableOrderWhere(from: Date, to: Date): Prisma.OrderWhereInput {
  return {
    ...accountOrderWhere(),
    deliveredOn: { gte: parisDayOf(from), lt: parisDayOf(to) },
  };
}

/**
 * La même assiette, sans borne haute : livré depuis `from`. Pour juger UN bon
 * à l'instant (l'état d'encaissement) — un bon livré aujourd'hui y est.
 */
export function billableSinceWhere(from: Date): Prisma.OrderWhereInput {
  return { ...accountOrderWhere(), deliveredOn: { gte: parisDayOf(from) } };
}

/**
 * Un bon passé AU COMPTE et vivant, livré ou non — l'assiette sans sa
 * fenêtre. Les « Bons à constater » en partent : ce sont ceux qui y entreront
 * dès qu'on aura constaté leur remise.
 */
export function accountOrderWhere(): Prisma.OrderWhereInput {
  return {
    paymentStatus: "not_required",
    totalCents: { gt: 0 },
    status: { not: "cancelled" },
    companyId: { not: null },
  };
}

/** Le jour de Paris d'un instant, sous la forme d'une colonne `@db.Date`. */
function parisDayOf(instant: Date): Date {
  return dayColumnOf(instantToLocal(instant).day);
}

/** Un jour `AAAA-MM-JJ` sous la forme d'une colonne `@db.Date` (minuit UTC). */
export function dayColumnOf(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}
