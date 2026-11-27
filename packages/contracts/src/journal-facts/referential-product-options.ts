import { z } from "zod";

import { fact, payload, subjectLabel, type JournalFactFamily } from "./fact.js";

/**
 * **Les options de commande du référentiel** — « tranché » pour le pain
 * (`documentation/catalogue/plan-options-de-commande.md`, § 3.1). Écrits par
 * les handlers du PIM, par `PimJournal.trace()`.
 *
 * Un groupe se dit par son nom et les libellés de ses choix en service, dans
 * leur ordre — ce que le client verra. L'activation sur une fiche cite le
 * groupe par son nom du moment, et les déclinaisons par le leur ; `null` =
 * toutes les déclinaisons.
 */

const groupState = payload({
  subjectLabel: subjectLabel(),
  name: z.string().min(1),
  choices: z.array(z.string().min(1)),
});

const groupGesture = payload({ subjectLabel: subjectLabel(), name: z.string().min(1) });

export const REFERENTIAL_PRODUCT_OPTION_FACTS = {
  "option_group.created": fact(groupState),
  /** L'état APRÈS la révision : le nom et les choix en service. */
  "option_group.revised": fact(groupState),
  "option_group.archived": fact(groupGesture),
  "option_group.restored": fact(groupGesture),
  /** `subjectLabel` = le nom de la fiche ; `name` = celui du groupe. */
  "product.option_group_activated": fact(
    payload({
      subjectLabel: subjectLabel(),
      name: z.string().min(1),
      variants: z.array(z.string().min(1)).nullable(),
    }),
  ),
  "product.option_group_deactivated": fact(groupGesture),
} as const satisfies JournalFactFamily;
