import { z } from "zod";

import {
  changes,
  day,
  fact,
  fromTo,
  instant,
  localizedText,
  payload,
  subjectLabel,
  type JournalFactFamily,
} from "./fact.js";

/**
 * **Les opérations datées tenues au commerce** — Noël, Pâques, la galette
 * (`documentation/operations-datees/plan-l-operation-passe-au-commerce.md`,
 * O6, lot 1). Écrits par les handlers de `b2b/operations/`, par
 * `publishTraced`. Rangés dans la famille `commerce`.
 *
 * Mêmes gestes que les faits `operation.*` du référentiel, qui restent
 * lisibles : le passé ne se réécrit pas, et les nouveaux s'écrivent ici. Le
 * sujet est l'opération (`catalog_operation`, comme la surcharge), son
 * `subjectId` sa **clé** ; `subjectLabel` son nom français du moment.
 *
 * Un fait par geste, et non un fourre-tout : redater change ce que la
 * boutique vend et quand, renommer ne change que ce qu'elle affiche.
 */

const AUDIENCES = ["pro", "public", "both"] as const;
const audience = () => z.enum(AUDIENCES);

/** L'image : son URL et son texte alternatif. */
const image = () => payload({ url: z.string(), alt: z.string() });

/** Les cinq dates (D2) : trois instants, deux jours de retrait. */
const schedule = {
  announceFrom: instant(),
  orderFrom: instant().nullable(),
  orderUntil: instant(),
  pickupFrom: day(),
  pickupUntil: day(),
};

/** Le geste nu : l'opération seule, nommée. */
const named = () => fact(payload({ subjectLabel: subjectLabel() }));

export const COMMERCE_OPERATION_FACTS = {
  /** Préparée : tout ce qu'elle dit à sa naissance. La sélection commence vide. */
  "catalog_operation.prepared": fact(
    payload({
      subjectLabel: subjectLabel(),
      name: localizedText(),
      lede: localizedText().nullable(),
      image: image().nullable(),
      audience: audience(),
      ...schedule,
    }),
  ),
  /** Nom, accroche, image — ce que l'annonce affiche. Le diff seul. */
  "catalog_operation.edited": fact(
    payload({
      subjectLabel: subjectLabel(),
      changes: changes({
        name: localizedText(),
        lede: localizedText().nullable(),
        image: image().nullable(),
      }),
    }),
  ),
  /** Les dates qui ont bougé, avant → après. */
  "catalog_operation.rescheduled": fact(
    payload({ subjectLabel: subjectLabel(), changes: changes(schedule) }),
  ),
  "catalog_operation.audience_changed": fact(
    payload({ subjectLabel: subjectLabel(), audience: fromTo(audience()) }),
  ),
  /** Masquée : plus annoncée ni vendue, sans être archivée — cela se reprend. */
  "catalog_operation.hidden": named(),
  /** Affichée de nouveau, après avoir été masquée. */
  "catalog_operation.shown": named(),
  /** La sélection ENTIÈRE, avant → après, dans l'ordre du rayon. */
  "catalog_operation.selection_saved": fact(
    payload({ subjectLabel: subjectLabel(), skus: fromTo(z.array(z.string())) }),
  ),
  /** Archivée : retirée pour toujours, sa clé reste prise. */
  "catalog_operation.archived": named(),
} as const satisfies JournalFactFamily;
