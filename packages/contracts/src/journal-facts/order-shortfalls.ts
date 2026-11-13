import { z } from "zod";

import { SHORTFALL_REFUND_CAUSES, shortfallRemainderSchema } from "../admin-order-detail.js";
import { cents, count, fact, namedOrBare, payload, ref, subjectLabel } from "./fact.js";

/**
 * **Le départ incomplet décidé** (plan
 * plan E6c2 (`documentation/commandes/bon-de-livraison.md`)
 * § 5) — une décision d'argent prise par une personne : la facture lira ce qui
 * part, plus la commande entière. Le sujet est le client, comme
 * `order.revised` ; `decidedBy` la fiche staff, sous son nom du moment ;
 * `departing` ce qui part, article par article ; `remainder` le sort du reste
 * (`abandoned` seul jusqu'au reliquat, E7).
 */
export const ORDER_SHORTFALL_FACTS = {
  "order.shortfall_decided": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      orderId: ref("order"),
      orderNumber: z.string(),
      decidedBy: namedOrBare("staff_user"),
      departing: z.array(z.object({ sku: z.string().min(1), quantity: count() })),
      remainder: shortfallRemainderSchema,
    }),
  ),
  /**
   * **Le reste d'un départ incomplet n'a pas été remboursé** (plan
   * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.4) : au
   * solde, l'abonné a jugé qu'aucune demande ne pouvait partir, et n'a rien
   * écrit côté argent. Écrit par la machine (acteur `system`). Le sujet est la
   * COMMANDE, son libellé son numéro. `amountCents` : le reste calculé, `null`
   * quand la cause est jugée avant le calcul (facture émise, hausse en
   * cours) ; `stoppedAmount` : parmi les paiements qui se rendent, une demande
   * arrêtée attend « Relancer » ou « Réglé autrement » — la sortie d'un
   * `not_covered`. 🔴 Type et causes irréversibles.
   */
  "order.shortfall_refund_blocked": fact(
    payload({
      subjectLabel: subjectLabel(),
      cause: z.enum(SHORTFALL_REFUND_CAUSES),
      amountCents: cents().nullable(),
      stoppedAmount: z.boolean(),
    }),
  ),
};
