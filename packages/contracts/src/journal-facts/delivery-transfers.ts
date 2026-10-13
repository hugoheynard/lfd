import { z } from "zod";

import { count, day, fact, named, payload, subjectLabel } from "./fact.js";

/**
 * **Le transfert interne** (2026-10-13,
 * `documentation/livraisons/transferts/plan-transfert-interne.md`, lot T1).
 *
 * Rangés dans la famille « commandes et production », comme la composition
 * des tournées. Le sujet d'un fait `internal_transfer.*` est le TRANSFERT ;
 * son libellé est le nom du site servi, figé à l'ouverture. Un fait
 * `delivery_round.transfer_stop_*` a pour sujet la tournée, comme ses
 * voisins, et cite le transfert par le nom de son site.
 */

/** Pourquoi la composition n'a placé un transfert dans aucune tournée. */
export const TRANSFER_UNPLACED_REASONS = ["no_vehicle", "site_not_located"] as const;

const roundKey = () => ({ subjectLabel: subjectLabel(), day: day(), passage: count() });

export const DELIVERY_TRANSFER_FACTS = {
  /** Un transfert prévu s'ouvre pour un site et un jour (Q-T3 : autant que nécessaire). */
  "internal_transfer.opened": fact(payload({ subjectLabel: subjectLabel(), day: day() })),
  /**
   * La composition a placé l'arrêt du transfert dans une tournée.
   * `dedicated` : une tournée ouverte pour lui seul — le mode « dédié » du
   * site, ou le repli quand aucune tournée ne passait à temps (Q-T9).
   */
  "internal_transfer.placed": fact(
    payload({
      subjectLabel: subjectLabel(),
      day: day(),
      round: named("delivery_round"),
      passage: count(),
      dedicated: z.boolean(),
    }),
  ),
  /**
   * La composition n'a pu le placer nulle part (Q-T13) : il reste prévu, sans
   * arrêt. La sortie est l'affectation à la main, ou la réception manuelle.
   */
  "internal_transfer.unplaced": fact(
    payload({ subjectLabel: subjectLabel(), day: day(), cause: z.enum(TRANSFER_UNPLACED_REASONS) }),
  ),
  /** L'arrêt d'un transfert déplacé à la main : le sujet est la tournée d'ARRIVÉE. */
  "delivery_round.transfer_stop_moved": fact(
    payload({
      ...roundKey(),
      transfer: named("internal_transfer"),
      from: payload({ round: named("delivery_round"), passage: count() }),
      position: count(),
    }),
  ),
  /** L'arrêt d'un transfert retiré à la main : le transfert redevient sans arrêt. */
  "delivery_round.transfer_stop_removed": fact(
    payload({ ...roundKey(), transfer: named("internal_transfer") }),
  ),
} as const;
