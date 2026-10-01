import { z } from "zod";

import { count, day, fact, named, namedOrBare, payload, subjectLabel } from "./fact.js";

/**
 * **La composition des tournées** (2026-09-29,
 * `documentation/livraisons/plan-preparation-de-tournee.md`, lot 3, C7).
 *
 * Rangés dans la famille « commandes et production », comme la flotte : une
 * entrée à part de cette famille pour tenir `orders-production.ts` sous sa
 * taille, pas une famille de plus.
 *
 * Le sujet est la **tournée** ; son libellé est le nom du véhicule, recopié à
 * l'ouverture. La commande est citée par son numéro — ou par son seul id quand
 * le commerce ne la connaît plus (une commande n'est jamais supprimée en
 * production ; seul un semis de démonstration le fait). Le fait ne se perd pas
 * pour un nom manquant, et il n'en invente pas.
 */

/** Le jour et le passage : ce qui distingue deux tournées d'un même véhicule (Q13). */
const roundKey = () => ({ subjectLabel: subjectLabel(), day: day(), passage: count() });

/** Une tournée citée depuis une autre : son véhicule, et son passage. */
const roundRef = () => payload({ round: named("delivery_round"), passage: count() });

export const DELIVERY_ROUND_FACTS = {
  "delivery_round.opened": fact(payload(roundKey())),
  "delivery_round.stop_assigned": fact(
    payload({ ...roundKey(), order: named("order"), position: count() }),
  ),
  /**
   * UN fait pour un déplacement, jamais un retrait suivi d'un ajout (C7) : le
   * sujet est la tournée d'ARRIVÉE, et `from` dit d'où l'arrêt vient.
   */
  "delivery_round.stop_moved": fact(
    payload({ ...roundKey(), order: namedOrBare("order"), from: roundRef(), position: count() }),
  ),
  "delivery_round.stop_removed": fact(payload({ ...roundKey(), order: namedOrBare("order") })),
  /** L'ordre AVANT et APRÈS ; un réordonnancement qui ne change rien n'écrit rien. */
  "delivery_round.reordered": fact(
    payload({
      ...roundKey(),
      before: z.array(namedOrBare("order")),
      after: z.array(namedOrBare("order")),
    }),
  ),
  /**
   * Le livreur affecté à la tournée (plan « Ma tournée », MT-D2) ; `previous`
   * nomme celui qu'il remplace, `null` s'il n'y en avait pas. Cité par son nom
   * quand l'annuaire le connaît, par son seul id sinon.
   */
  "delivery_round.driver_assigned": fact(
    payload({
      ...roundKey(),
      driver: namedOrBare("staff_user"),
      previous: namedOrBare("staff_user").nullable(),
    }),
  ),
  /** La tournée n'a plus de livreur affecté. */
  "delivery_round.driver_unassigned": fact(
    payload({ ...roundKey(), previous: namedOrBare("staff_user") }),
  ),
} as const;
