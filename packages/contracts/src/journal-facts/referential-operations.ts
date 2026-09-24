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
 * **Les opérations datées du référentiel** — Noël, Pâques, la galette
 * (`documentation/order/architecture-operations-datees.md`, lot 1). Écrits
 * par les handlers de `pim/operations/`, par `PimJournal.trace()`.
 *
 * Le sujet est l'opération, son `subjectId` sa **clé** (`noel-2026`) : une clé
 * ne se réemploie jamais, donc l'historique d'une clé est celui d'une seule
 * opération. `subjectLabel` est son nom français du moment.
 *
 * Un fait par geste de l'écran de préparation, et non un `operation.updated`
 * fourre-tout : redater change ce que la boutique vendra et quand, renommer
 * ne change que ce qu'elle affiche — « qui a avancé la clôture de Noël » ne
 * doit pas se chercher dans des retouches d'accroche.
 */

/**
 * Les clientèles — recopiées de `@lfd/pim-contracts` (`OPERATION_AUDIENCES`)
 * plutôt qu'importées : ce paquet ne dépend que de zod. Les deux listes ne
 * divergent pas en silence : la suite des handlers des opérations écrit chaque
 * clientèle du contrat contre ce catalogue (`RecordingJournal` strict).
 */
const OPERATION_AUDIENCES = ["pro", "public", "both"] as const;
const audience = () => z.enum(OPERATION_AUDIENCES);

/** L'image : l'URL de la médiathèque et son texte alternatif. */
const image = () => payload({ url: z.string(), alt: z.string() });

/** Les cinq dates (D2) : trois instants, deux jours de retrait. */
const schedule = {
  announceFrom: instant(),
  orderFrom: instant().nullable(),
  orderUntil: instant(),
  pickupFrom: day(),
  pickupUntil: day(),
};

export const REFERENTIAL_OPERATION_FACTS = {
  /** Préparée : tout ce qu'elle dit à sa naissance. La sélection commence vide. */
  "operation.prepared": fact(
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
  "operation.edited": fact(
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
  "operation.rescheduled": fact(
    payload({ subjectLabel: subjectLabel(), changes: changes(schedule) }),
  ),
  "operation.audience_changed": fact(
    payload({ subjectLabel: subjectLabel(), audience: fromTo(audience()) }),
  ),
  /**
   * La sélection ENTIÈRE, avant → après, dans l'ordre : un article déplacé
   * compte autant qu'un article ajouté, puisque l'ordre est celui du rayon.
   * Les articles s'y disent par leur SKU — le mot du métier.
   */
  "operation.selection_saved": fact(
    payload({ subjectLabel: subjectLabel(), skus: fromTo(z.array(z.string())) }),
  ),
  /** Archivée : sa clé reste prise pour toujours. */
  "operation.archived": fact(payload({ subjectLabel: subjectLabel() })),
} as const satisfies JournalFactFamily;
