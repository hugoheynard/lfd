import { z } from "zod";

import { count, fact, named, payload, subjectLabel } from "./fact.js";

/**
 * **Les scénarios du simulateur de tournée** (2026-09-29,
 * `documentation/livraisons/plan-preparation-de-tournee.md`, lot 9, L9-C7).
 *
 * Même famille que la composition (« commandes et production »). Le sujet est
 * le scénario, son libellé son nom du moment ; la charge ne recopie pas le
 * scénario — des arrêts inventés n'apprennent rien au journal, leur nombre
 * suffit à reconnaître l'essai.
 */
export const DELIVERY_SIMULATION_FACTS = {
  /** Un scénario enregistré pour la première fois. */
  "delivery_simulation_scenario.created": fact(
    payload({ subjectLabel: subjectLabel(), stops: count(), vehicles: count() }),
  ),
  /**
   * Un scénario remplacé — son nom et son contenu. `renamedFrom` est l'ancien
   * nom quand il a changé, `null` sinon.
   */
  "delivery_simulation_scenario.replaced": fact(
    payload({
      subjectLabel: subjectLabel(),
      renamedFrom: z.string().min(1).nullable(),
      stops: count(),
      vehicles: count(),
    }),
  ),
  /** Un scénario né d'un autre : `source` est celui qu'on a dupliqué. */
  "delivery_simulation_scenario.duplicated": fact(
    payload({ subjectLabel: subjectLabel(), source: named("delivery_simulation_scenario") }),
  ),
  /** Un scénario archivé : il sort de la liste, son nom se libère. */
  "delivery_simulation_scenario.archived": fact(payload({ subjectLabel: subjectLabel() })),
} as const;
