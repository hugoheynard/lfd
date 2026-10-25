import { z } from "zod";

import { shortfallRemainderSchema } from "../admin-order-detail.js";
import { count, fact, namedOrBare, payload, ref, subjectLabel } from "./fact.js";

/**
 * **Le départ incomplet décidé** (plan
 * `documentation/commandes/plan-e6c2-la-facture-lit-les-montants-facturables.md`
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
};
