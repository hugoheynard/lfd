import { z } from "zod";

import {
  clockTime,
  count,
  day,
  fact,
  minutes,
  named,
  namedOrBare,
  payload,
  subjectLabel,
} from "./fact.js";

/**
 * **Le calculateur de tournée** (2026-09-29,
 * `documentation/livraisons/plan-preparation-de-tournee.md`, lot 7).
 *
 * Même famille que la composition (« commandes et production »), dans son
 * propre fichier pour tenir `orders-production.ts` sous sa taille.
 */

/** Les réglages du calcul, tels qu'ils valent. */
const routingSettings = () =>
  payload({
    detourPercent: count(),
    averageSpeedKmh: count(),
    earliestDeparture: clockTime(),
    maxRoundMinutes: minutes(),
    stopMinutes: minutes(),
    defaultMode: z.enum(["insert", "new_rounds"]),
    multiplePassages: z.boolean(),
    /** Lot 7 ter (L7t-C1) : absente des faits écrits avant son arrivée. */
    safetyMarginMinutes: minutes().optional(),
  });

/** Une tournée touchée par une proposition appliquée : ses arrêts AVANT et APRÈS. */
const appliedRound = () =>
  payload({
    round: named("delivery_round"),
    passage: count(),
    /** Ouverte par la proposition : `before` est alors vide. */
    opened: z.boolean(),
    before: z.array(namedOrBare("order")),
    after: z.array(namedOrBare("order")),
  });

export const DELIVERY_ROUTING_FACTS = {
  /**
   * Les réglages du calcul ont changé (L7-C13). `before` est `null` quand
   * personne n'avait réglé : le calcul tournait sur ses défauts.
   */
  "delivery_routing.settings_updated": fact(
    payload({
      subjectLabel: subjectLabel(),
      before: routingSettings().nullable(),
      after: routingSettings(),
    }),
  ),
  /**
   * Une proposition du calculateur a été appliquée (L7-C14) — UN fait pour
   * toute la proposition. Le sujet est le JOUR ; chaque tournée touchée dit
   * ses arrêts avant et après. Figé dès le premier en production.
   */
  "delivery_round.proposal_applied": fact(
    payload({ subjectLabel: subjectLabel(), day: day(), rounds: z.array(appliedRound()) }),
  ),
} as const;
