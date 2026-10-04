import { z } from "zod";

import { count, fact, named, payload, subjectLabel } from "./fact.js";

/**
 * **Les contenants du colisage** (K2b, 2026-10-04,
 * `documentation/colisage/plan-les-bacs-au-colisage.md` §5–§5.1) — la colonne
 * Contenants du poste : un bac (déclaré par la livraison, qui journalise aussi
 * sa naissance sous `delivery_bin.declared`) ou un sac à emporter, et ce qu'on
 * y glisse.
 *
 * Rangé sous le module `production` du journal, avec le poste. Le sujet est la
 * COMMANDE, son libellé son numéro ; le contenant est cité par son code de bac,
 * ou « sac ».
 */
const containerFact = () =>
  payload({ subjectLabel: subjectLabel(), container: named("packing_container") });

/** Ce qu'on glisse ou qu'on retire : l'article, nommé du moment, et combien. */
const movedFact = () =>
  payload({
    ...containerFact().shape,
    sku: z.string().min(1),
    productName: z.string().min(1),
    quantity: count(),
  });

export const PACKING_CONTAINER_FACTS = {
  /** Un contenant de plus pour la commande — un bac déjà déclaré, ou un sac. */
  "packing_container.opened": fact(
    payload({ ...containerFact().shape, nature: z.enum(["bin", "bag"]) }),
  ),
  /** Des pièces d'une ligne glissées dans un contenant. */
  "packing_container.filled": fact(movedFact()),
  /** Des pièces d'une ligne ressorties d'un contenant. */
  "packing_container.emptied": fact(movedFact()),
  /** Un contenant annulé : ce qu'il portait retourne à répartir. */
  "packing_container.voided": fact(containerFact()),
} as const;
