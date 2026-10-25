import { z } from "zod";

import { count, day, fact, payload, ref, subjectLabel } from "./fact.js";

/** Une ligne révisée, de → à, nommée comme le plan ou la feuille la nomme. */
const revisedLine = () =>
  z.strictObject({
    sku: z.string().min(1),
    productName: z.string().min(1),
    from: count(),
    to: count(),
  });

/**
 * **Les quantités d'une commande changées après l'arrêt du plan** (plan A2,
 * `documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
 * § 7) — l'équipe a modifié les quantités d'une commande au compte déjà
 * inscrite. Deux faits, un par atelier, irréversibles dès la première
 * révision en production :
 *
 * - `production_day.order_quantities_raised` — le fournil a monté le dû de la
 *   commande, et le compte du jour d'autant ; seulement sur une hausse (une
 *   baisse ne fait pas baisser le compte). Sujet : la journée, libellée par sa
 *   date ; `orderNumber` est la référence figée au plan.
 * - `packing_sheet.revised` — le colisage a révisé les lignes dues de la
 *   feuille. Sujet : la commande, libellée par son numéro, comme les
 *   contenants.
 */
export const AFTER_CLOSE_REVISION_FACTS = {
  "production_day.order_quantities_raised": fact(
    payload({
      subjectLabel: subjectLabel(),
      serviceDay: day(),
      orderId: ref("order"),
      orderNumber: z.string().min(1),
      lines: z.array(revisedLine()).min(1),
    }),
  ),
  "packing_sheet.revised": fact(
    payload({
      subjectLabel: subjectLabel(),
      serviceDay: day(),
      lines: z.array(revisedLine()).min(1),
    }),
  ),
};
