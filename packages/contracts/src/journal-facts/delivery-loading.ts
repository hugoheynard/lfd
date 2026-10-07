import { z } from "zod";

import { count, day, fact, instant, named, namedOrBare, payload, subjectLabel } from "./fact.js";

/**
 * **Le chargement, véhicule par véhicule** (2026-09-29,
 * `documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 4, v4).
 *
 * Même famille que la composition (« commandes et production »), dans son
 * propre fichier pour tenir `orders-production.ts` sous sa taille.
 *
 * Le sujet d'un fait de bac est le **bac** ; son libellé est son code court,
 * celui qu'on lit sur l'étiquette. La commande est citée par son numéro — ou
 * par son seul id quand le commerce ne la connaît plus : le fait ne se perd pas
 * pour un nom manquant, et il n'en invente pas.
 */

/** Une tournée citée depuis un bac : son véhicule, son jour, son passage. */
const roundRef = () => payload({ round: named("delivery_round"), day: day(), passage: count() });

/** Le côté d'une moitié de bac cloisonné ; `null` = bac entier. */
const half = () => z.enum(["left", "right"]).nullable();

export const DELIVERY_LOADING_FACTS = {
  /**
   * Des bacs d'UN type de plus pour une commande (L4-C16, lot 4 bis v2-4). Le
   * sujet est la COMMANDE : une déclaration en crée plusieurs d'un coup. Chaque
   * bac est nommé par son code court, avec sa moitié (`null` = entier).
   * `innerBags` : les sacs posés dans CHAQUE bac déclaré.
   */
  "delivery_bin.declared": fact(
    payload({
      subjectLabel: subjectLabel(),
      binType: named("delivery_bin_type"),
      innerBags: count(),
      bins: z.array(payload({ bin: named("delivery_bin"), half: half() })),
    }),
  ),
  /**
   * L'AUTRE moitié d'un bac déjà à moitié déclaré pour une autre commande
   * (v2-4) — deux commandes à des arrêts consécutifs d'une même tournée. Sujet
   * la commande qui reçoit la moitié ; `partner` est la moitié de l'autre.
   */
  "delivery_bin.shared": fact(
    payload({
      subjectLabel: subjectLabel(),
      binType: named("delivery_bin_type"),
      innerBags: count(),
      bin: named("delivery_bin"),
      half: z.enum(["left", "right"]),
      partner: named("delivery_bin"),
      partnerOrder: namedOrBare("order"),
    }),
  ),
  /** Un bac de trop, annulé (L4-C19). */
  "delivery_bin.voided": fact(
    payload({ subjectLabel: subjectLabel(), order: namedOrBare("order") }),
  ),
  /** Chargé dans une tournée, par le QR (`scan`) ou le code tapé (`code`). */
  "delivery_bin.loaded": fact(
    payload({
      subjectLabel: subjectLabel(),
      order: namedOrBare("order"),
      ...roundRef().shape,
      via: z.enum(["scan", "code"]),
    }),
  ),
  /** Déchargé : le fait garde qui avait chargé, et quand (plan, contradiction de `vitruve`). */
  "delivery_bin.unloaded": fact(
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
   * rien ne se compose ni ne se charge (I6). `bins` : les bacs non annulés
   * qui partent (une moitié compte pour un).
   */
  "delivery_round.departed": fact(
    payload({
      subjectLabel: subjectLabel(),
      day: day(),
      passage: count(),
      stops: count(),
      bins: count(),
    }),
  ),
} as const;
