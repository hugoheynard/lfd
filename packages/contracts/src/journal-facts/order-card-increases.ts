import { z } from "zod";

import { cents, count, fact, instant, payload, subjectLabel } from "./fact.js";

/**
 * **La hausse d'une commande payée par carte** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, R12) — chaque
 * transition du projet de hausse, écrite dans la transaction qui l'écrit.
 *
 * Le sujet est la COMMANDE, son libellé son numéro ; `complementCents` est le
 * complément du projet (l'écart que le client paie). Aucun identifiant du
 * prestataire dans la charge, comme `order-refunds.ts`. Le projet n'a pas de
 * nom : sa commande le nomme, et ses faits se lisent dans l'ordre.
 *
 * 🔴 Des valeurs de type et de cause irréversibles une fois écrites.
 */

/** Pourquoi un projet en attente de paiement est abandonné. */
export const CARD_INCREASE_ABANDON_CAUSES = [
  "expired",
  "customer",
  "staff",
  "replaced",
  "order_cancelled",
] as const;

const proposal = () => ({ subjectLabel: subjectLabel(), complementCents: cents() });

export const ORDER_CARD_INCREASE_FACTS = {
  /** Le client a demandé une hausse : le complément attend son paiement jusqu'à `expiresAt`. */
  "order.card_increase_proposed": fact(
    payload({ ...proposal(), targetTotalCents: cents(), expiresAt: instant() }),
  ),
  /** Le complément est encaissé à temps : la modification attend d'être appliquée. */
  "order.card_increase_paid": fact(payload(proposal())),
  /** La modification est écrite : `revision` est celle qu'elle a produite. */
  "order.card_increase_applied": fact(payload({ ...proposal(), revision: count() })),
  /** Plus possible : le complément sera rendu. `refusal` est le code du refus métier. */
  "order.card_increase_refused": fact(payload({ ...proposal(), refusal: z.string().min(1) })),
  /** Le projet en attente de paiement est abandonné, et pourquoi. */
  "order.card_increase_abandoned": fact(
    payload({ ...proposal(), cause: z.enum(CARD_INCREASE_ABANDON_CAUSES) }),
  ),
  /** Pannes répétées de l'application : le projet attend « Relancer ». */
  "order.card_increase_stalled": fact(
    payload({ ...proposal(), attempts: count(), failure: z.string().min(1) }),
  ),
  /** Le complément d'un projet abandonné est encaissé tard : il sera rendu. */
  "order.card_increase_closed": fact(payload(proposal())),
  /** « Relancer » : l'équipe a rendu le projet à l'exécuteur. */
  "order.card_increase_relaunched": fact(payload(proposal())),
  /** Le complément à rendre l'était déjà (l'annulation de la commande a tout rendu). */
  "order.card_increase_already_returned": fact(payload(proposal())),
} as const;
