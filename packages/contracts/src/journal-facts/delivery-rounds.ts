import { z } from "zod";

import { DELIVERY_INCIDENT_FAMILIES } from "../delivery-doorstep.js";
import { STOP_DECISION_SOURCES } from "../delivery-stop-decision.js";
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
  /**
   * « Tournée terminée » (`parcours-du-livreur.md`, PL2) : les bacs vides sont
   * rentrés. `openStops` : les arrêts restés ouverts — ils le restent, et
   * « Non remis » les montre.
   */
  "delivery_round.returned": fact(payload({ ...roundKey(), openStops: count() })),
  /**
   * « Je suis arrivé » sur un arrêt (`a-la-porte.md`, AP-D6) : l'auteur
   * est le livreur, sur la ligne. Une seconde arrivée n'écrit rien.
   */
  "delivery_round.stop_arrived": fact(payload({ ...roundKey(), order: namedOrBare("order") })),
  /**
   * Un problème signalé (§ 3) — il ne clôt rien. `order` : l'arrêt concerné,
   * `null` pour un problème de la tournée seule. La note n'est PAS ici : un
   * texte libre du livreur reste sur sa ligne, l'écran le relit là.
   */
  "delivery_round.incident_reported": fact(
    payload({
      ...roundKey(),
      order: namedOrBare("order").nullable(),
      family: z.enum(DELIVERY_INCIDENT_FAMILIES),
      reason: z.string().min(1),
      withPhoto: z.boolean(),
    }),
  ),
  /**
   * Un arrêt clos SANS remise : la commande était déjà retirée, ou annulée
   * (AP-D2, L6-C11). `cause` dit laquelle, lue au commerce au moment du geste.
   */
  "delivery_round.stop_closed_without_handover": fact(
    payload({
      ...roundKey(),
      order: namedOrBare("order"),
      cause: z.enum(["handed_over", "cancelled"]),
    }),
  ),
  /**
   * « Remis au client » (`a-la-porte.md`, B1) : la remise est attestée au
   * retrait et l'arrêt clos, dans la même transaction. `signed` : une
   * signature au doigt est jointe. Le nom de qui a réceptionné n'est PAS ici :
   * un texte libre reste sur sa pièce, au retrait.
   */
  "delivery_round.stop_handed_over": fact(
    payload({ ...roundKey(), order: namedOrBare("order"), signed: z.boolean() }),
  ),
  /**
   * « Déposé avec preuve » (`a-la-porte.md`, B2) : le dépôt sans
   * personne est attesté au retrait (`deposit`) et l'arrêt clos, dans la même
   * transaction. Une photo, toujours ; ni nom ni signature.
   */
  "delivery_round.stop_deposited": fact(payload({ ...roundKey(), order: namedOrBare("order") })),
  /**
   * « Autoriser le dépôt cette fois » (`a-la-porte.md`, B3, LB-Q5) : la
   * décision d'un commercial sur un arrêt signalé — la carte du livreur
   * propose « Déposé avec preuve », même signature exigée. `source` : un
   * commercial (`staff`), ou un réglage décidé d'avance (`setting`, B3 bis).
   */
  "delivery_round.stop_deposit_authorized": fact(
    payload({ ...roundKey(), order: namedOrBare("order"), source: z.enum(STOP_DECISION_SOURCES) }),
  ),
  /**
   * « Rapporter » (B3, LB-Q2) : l'arrêt se clôt « rapporté » ; la commande
   * reste prête, non livrée, et peut repartir dans une autre tournée.
   */
  "delivery_round.stop_brought_back": fact(
    payload({ ...roundKey(), order: namedOrBare("order"), source: z.enum(STOP_DECISION_SOURCES) }),
  ),
} as const;
