import { z } from "zod";

import { fact, namedOrBare, payload, ref, subjectLabel } from "./fact.js";

/** L'engagement tel que le journal le garde : deux textes, vides permis. */
const commitment = z.object({ number: z.string(), serviceCode: z.string() }).nullable();

/**
 * **L'engagement budgétaire d'une commande corrigé par l'équipe** (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 quater, E3′) — tant que la commande n'est pas facturée : la facture
 * le reprendra. Le sujet est le client, comme `order.revised` ; `before` et
 * `after` disent l'engagement d'avant et d'après (`null` = aucun).
 */
export const ORDER_BUDGET_COMMITMENT_FACTS = {
  "order.budget_commitment_corrected": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      orderId: ref("order"),
      orderNumber: z.string(),
      correctedBy: namedOrBare("staff_user"),
      before: commitment,
      after: commitment,
    }),
  ),
};
