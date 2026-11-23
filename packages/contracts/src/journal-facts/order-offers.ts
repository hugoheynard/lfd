import { z } from "zod";

import { orderOfferNatureSchema } from "../admin-order.js";
import { cents, count, fact, namedOrBare, payload, ref, subjectLabel } from "./fact.js";

/**
 * **La commande offerte** (doc
 * `documentation/commandes/passation/la-commande-offerte.md`, § 2.6) — ce que
 * le journal garde d'une commande que l'équipe a offerte : qui, de quelle
 * nature, et ce qu'elle valait au calcul normal (TTC et TVA). Le sujet est le
 * client, comme `order.placed`.
 *
 * Le texte du motif n'y est pas : il peut nommer une personne (« dégustation
 * du mariage Dupont »), et le journal ne recopie pas un texte libre. Il reste
 * sur la commande. La nature suffit à la comptabilité pour trier les cadeaux
 * des échantillons.
 *
 * `order.offer_revalued` suit chaque modification d'une commande offerte, avec
 * la valeur APRÈS le geste : le cumul offert par bénéficiaire se lit sur le DERNIER fait de chaque commande,
 * jamais sur une valeur périmée. Une commande offerte annulée se lit par
 * `order.cancelled`, qui existe déjà.
 */
export const ORDER_OFFER_FACTS = {
  "order.offered": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      orderId: ref("order"),
      orderNumber: z.string(),
      offeredBy: namedOrBare("staff_user"),
      nature: orderOfferNatureSchema,
      offeredTotalCents: cents(),
      offeredVatCents: cents(),
    }),
  ),
  "order.offer_revalued": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      orderId: ref("order"),
      orderNumber: z.string(),
      revision: count(),
      offeredTotalCents: cents(),
      offeredVatCents: cents(),
    }),
  ),
};
