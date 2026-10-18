import { z } from "zod";

import {
  STAFF_SUGGESTION_AUDIENCES,
  STAFF_SUGGESTION_ORDERS,
  STAFF_SUGGESTION_PLACEMENTS,
  STAFF_SUGGESTION_TRIGGERS,
} from "../staff-suggestions.js";
import {
  changes,
  day,
  fact,
  fromTo,
  localizedText,
  payload,
  subjectLabel,
  type JournalFactFamily,
} from "./fact.js";

/**
 * **Les suggestions décidées par le staff**
 * (`documentation/recommandation-produit/plan-suggestions-du-staff.md`, RS1).
 * Écrits par les handlers de `b2b/recommendations/`, par `publishTraced`.
 * Rangés dans la famille `commerce` : décider ce que la boutique conseille est
 * le même métier que la vitrine et la mise en avant.
 *
 * Le sujet est la règle (`staff_suggestion`), son `subjectId` son id ;
 * `subjectLabel` sa phrase française du moment, sinon les SKU qu'elle suggère.
 * L'ordre entre règles est un réglage unique (`staff_suggestion_order`).
 */

/** Tout ce qu'une règle dit — sa naissance, ou les deux côtés d'une réécriture. */
const rule = {
  trigger: z.enum(STAFF_SUGGESTION_TRIGGERS),
  /** Le SKU ou l'id de la famille qui déclenche ; `null` pour « partout ». */
  triggerRef: z.string().nullable(),
  skus: z.array(z.string()),
  placement: z.enum(STAFF_SUGGESTION_PLACEMENTS),
  audience: z.enum(STAFF_SUGGESTION_AUDIENCES),
  startsOn: day(),
  endsOn: day(),
  phrase: localizedText().nullable(),
  priority: z.number().int(),
};

/** Le geste nu : la règle seule, nommée. */
const named = () => fact(payload({ subjectLabel: subjectLabel() }));

export const COMMERCE_SUGGESTION_FACTS = {
  /** Créée : tout ce qu'elle dit à sa naissance. Une règle naît allumée. */
  "staff_suggestion.created": fact(payload({ subjectLabel: subjectLabel(), ...rule })),
  /** Réécrite : les champs qui ont bougé, avant → après. */
  "staff_suggestion.revised": fact(
    payload({ subjectLabel: subjectLabel(), changes: changes(rule) }),
  ),
  /** Rallumée après avoir été coupée. */
  "staff_suggestion.activated": named(),
  /** Coupée sans être archivée — cela se reprend. */
  "staff_suggestion.deactivated": named(),
  /** Archivée : retirée pour toujours, jamais supprimée. */
  "staff_suggestion.archived": named(),
  /** L'ordre entre règles concurrentes, avant → après (Q3). */
  "staff_suggestion_order.changed": fact(
    payload({ order: fromTo(z.enum(STAFF_SUGGESTION_ORDERS)) }),
  ),
} as const satisfies JournalFactFamily;
