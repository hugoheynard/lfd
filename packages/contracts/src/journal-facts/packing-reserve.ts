import { z } from "zod";

import { count, day, fact, namedOrBare, payload, ref, subjectLabel } from "./fact.js";

/**
 * **Une sortie de la réserve du colisage vers une boutique** (plan A1, lot
 * A1.4, `documentation/commandes/annulation/plan-a1-4-envoyer-en-boutique.md`)
 * — le pain rendu par une annulation, ou tout surplus, envoyé à un point qui
 * le reçoit comme un réassort d'origine `reserve`.
 *
 * - `packing_stock.sent_to_shop` — sujet : la réserve de la journée, libellée
 *   par sa date ; `site` le point (son nom du moment, ou son seul id) ;
 *   `resupplyId` le réassort né du geste ; `lines` ce qui est sorti, article
 *   par article.
 */
export const PACKING_RESERVE_FACTS = {
  "packing_stock.sent_to_shop": fact(
    payload({
      subjectLabel: subjectLabel(),
      serviceDay: day(),
      site: namedOrBare("pickup_address"),
      resupplyId: ref("site_resupply"),
      lines: z.array(
        z.strictObject({
          sku: z.string().min(1),
          productName: z.string().min(1),
          quantity: count(),
        }),
      ),
    }),
  ),
};
