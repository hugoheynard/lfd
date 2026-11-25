import { z } from "zod";

import { PRODUCTION_TRACKING_LEVELS } from "../production-settings.js";
import { count, fact, named, payload, subjectLabel } from "./fact.js";

/**
 * **Les postes du fournil** (`documentation/fournil/les-postes-du-fournil.md`,
 * § 3.3, lot W1, 2026-11-16) — un fait par geste de la page Postes.
 *
 * Le sujet est le poste (`production_workstation`, son id) et son nom du
 * moment. Deux gestes visent la carte entière plutôt qu'un poste : l'ordre
 * des fiches, et des produits remis « à ranger » ; leur sujet porte alors un
 * nom qui le dit.
 */
const workstation = () => named("production_workstation");

/** Un niveau de suivi propre, ou `null` : le poste suit le fournil. */
const ownTrackingLevel = () => z.enum(PRODUCTION_TRACKING_LEVELS).nullable();

export const PRODUCTION_WORKSTATION_FACTS = {
  /** Un poste neuf, au rang `position` (en dernier). */
  "production_workstation.declared": fact(
    payload({ subjectLabel: subjectLabel(), position: count() }),
  ),
  /** Son nom a changé ; `previous` dit celui qu'il portait. */
  "production_workstation.renamed": fact(
    payload({ subjectLabel: subjectLabel(), previous: payload({ name: z.string().min(1) }) }),
  ),
  /** Le nouvel ordre des fiches : les postes en service, dans l'ordre. */
  "production_workstation.reordered": fact(
    payload({ subjectLabel: subjectLabel(), order: z.array(workstation()) }),
  ),
  /** Le poste est archivé : il ne portait plus aucun produit. */
  "production_workstation.archived": fact(payload({ subjectLabel: subjectLabel() })),
  /**
   * Des produits (références produit) placés sur un poste, ou remis « à
   * ranger » (`workstation: null`). `count` : combien ont réellement changé.
   */
  "production_workstation.products_placed": fact(
    payload({
      subjectLabel: subjectLabel(),
      workstation: workstation().nullable(),
      skus: z.array(z.string().min(1)),
      count: count(),
    }),
  ),
  /** La pile du poste : ses produits (références produit), du haut vers le bas. */
  "production_workstation.products_reordered": fact(
    payload({ subjectLabel: subjectLabel(), skus: z.array(z.string().min(1)) }),
  ),
  /**
   * Le niveau de suivi propre au poste (`fournil/les-niveaux-de-suivi.md`) ;
   * `null` : il suit le fournil. `previous` dit celui qu'il avait. Il vaut à
   * partir de la prochaine journée arrêtée.
   */
  "production_workstation.tracking_level_set": fact(
    payload({
      subjectLabel: subjectLabel(),
      trackingLevel: ownTrackingLevel(),
      previous: payload({ trackingLevel: ownTrackingLevel() }),
    }),
  ),
} as const;
