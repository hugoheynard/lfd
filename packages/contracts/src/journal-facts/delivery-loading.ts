import { z } from "zod";

import { count, day, fact, instant, named, namedOrBare, payload, subjectLabel } from "./fact.js";

/**
 * **Le chargement, véhicule par véhicule** (2026-09-29,
 * `documentation/livraisons/plan-preparation-de-tournee.md`, lot 4, v4).
 *
 * Même famille que la composition (« commandes et production »), dans son
 * propre fichier pour tenir `orders-production.ts` sous sa taille.
 *
 * Le sujet d'un fait de sac est le **sac** ; son libellé est son code court,
 * celui qu'on lit sur l'étiquette. La commande est citée par son numéro — ou
 * par son seul id quand le commerce ne la connaît plus : le fait ne se perd pas
 * pour un nom manquant, et il n'en invente pas.
 */

/** Une tournée citée depuis un sac : son véhicule, son jour, son passage. */
const roundRef = () => payload({ round: named("delivery_round"), day: day(), passage: count() });

export const DELIVERY_LOADING_FACTS = {
  /**
   * `count` sacs de plus pour une commande (L4-C16). Le sujet est la
   * COMMANDE : une déclaration en crée plusieurs d'un coup. Chaque sac est
   * nommé par son code court.
   */
  "delivery_bag.declared": fact(
    payload({ subjectLabel: subjectLabel(), bags: z.array(named("delivery_bag")) }),
  ),
  /** Un sac de trop, annulé (L4-C19). */
  "delivery_bag.voided": fact(
    payload({ subjectLabel: subjectLabel(), order: namedOrBare("order") }),
  ),
  /** Chargé dans une tournée, par le QR (`scan`) ou le code tapé (`code`). */
  "delivery_bag.loaded": fact(
    payload({
      subjectLabel: subjectLabel(),
      order: namedOrBare("order"),
      ...roundRef().shape,
      via: z.enum(["scan", "code"]),
    }),
  ),
  /** Déchargé : le fait garde qui avait chargé, et quand (plan, contradiction de `vitruve`). */
  "delivery_bag.unloaded": fact(
    payload({
      subjectLabel: subjectLabel(),
      order: namedOrBare("order"),
      ...roundRef().shape,
      loadedAt: instant(),
      loadedBy: namedOrBare("staff_user"),
    }),
  ),
  /**
   * La tournée est partie (L4-C4) : ce que le livreur verra est figé, plus
   * rien ne se compose ni ne se charge (I6).
   */
  "delivery_round.departed": fact(
    payload({
      subjectLabel: subjectLabel(),
      day: day(),
      passage: count(),
      stops: count(),
      bags: count(),
    }),
  ),
} as const;
