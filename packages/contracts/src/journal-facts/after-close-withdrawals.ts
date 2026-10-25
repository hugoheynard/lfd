import { z } from "zod";

import { count, day, fact, payload, ref, subjectLabel } from "./fact.js";

/**
 * **Une commande retirée après l'arrêt du plan** (plan A1,
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * § 3 ; C7 § 3.5) — un particulier, ou l'équipe pour lui, a annulé une
 * commande de retrait déjà inscrite au compte à produire.
 *
 * Deux faits, un par atelier : ce sont eux qui expliquent, au journal, un
 * compte à produire plus grand que les feuilles du colisage.
 *
 * - `production_day.order_withdrawn` — le fournil l'a retirée de sa journée
 *   SANS toucher au compte à produire ni aux fournées. Sujet : la journée,
 *   libellée par sa date ; `orderNumber` est la référence figée au plan,
 *   `null` si le plan ne la portait plus (jamais inventée).
 * - `packing_sheet.withdrawn` — le colisage a retiré la feuille ; `released`
 *   dit ce qui est revenu à la réserve du jour, article par article (vide :
 *   rien n'était au bac, ou la feuille n'était pas encore tirée). Sujet : la
 *   commande, libellée par son numéro, comme les contenants.
 */
export const AFTER_CLOSE_WITHDRAWAL_FACTS = {
  "production_day.order_withdrawn": fact(
    payload({
      subjectLabel: subjectLabel(),
      serviceDay: day(),
      orderId: ref("order"),
      orderNumber: z.string().min(1).nullable(),
    }),
  ),
  "packing_sheet.withdrawn": fact(
    payload({
      subjectLabel: subjectLabel(),
      serviceDay: day(),
      released: z.array(
        z.strictObject({
          sku: z.string().min(1),
          productName: z.string().min(1),
          quantity: count(),
        }),
      ),
    }),
  ),
};
