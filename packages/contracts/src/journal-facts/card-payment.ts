import { z } from "zod";

import { cents, fact, payload, subjectLabel } from "./fact.js";

/**
 * **L'encaissement par carte, ses remboursements** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §3.3, lot P1.b) — les faits que le bloc `card-payment` écrit lui-même, sous
 * le sujet `card_payment`.
 *
 * Le sujet est la DEMANDE de remboursement (son identifiant) ; son libellé est
 * celui du sujet de l'argent, tel que le bloc qui le possède le décrit
 * (`describe` du canal : « Commande CMD-142 »). Le commerce garde SES faits
 * (`order.refund_recorded`, `order.fully_refunded`…), écrits par lui au canal.
 *
 * 🔴 Aucun identifiant du prestataire dans la charge (ni `pi_…`, ni `re_…`) :
 * la règle d'`order-refunds.ts`, inchangée. `failure` est le code BRUT d'un
 * échec (`unavailable`, `declined:<code>`, `nothing_left`…) : il se lit, il
 * ne se traduit pas.
 */

/** Le code d'un échec, tel que la demande le garde. */
const failure = () => z.string().min(1);
/** La génération d'une demande : +1 à chaque « Relancer » d'une demande arrêtée. */
const generation = () => z.number().int().positive();

export const CARD_PAYMENT_FACTS = {
  /** Le prestataire a accepté la demande : ce qui était annoncé, ce qu'il a émis. */
  "card_payment.issued": fact(
    payload({
      subjectLabel: subjectLabel(),
      generation: generation(),
      announcedCents: cents(),
      issuedCents: cents(),
    }),
  ),
  /** Un essai d'émission sans réponse du prestataire : le système réessaie seul. */
  "card_payment.attempt_failed": fact(
    payload({ subjectLabel: subjectLabel(), generation: generation(), failure: failure() }),
  ),
  /**
   * La demande s'arrête : rejouer ne changerait rien (refus, rien à rendre,
   * remboursement mort ou inversé). Elle attend « Relancer » ou « rendu autrement ».
   */
  "card_payment.stopped": fact(
    payload({ subjectLabel: subjectLabel(), generation: generation(), failure: failure() }),
  ),
  /** « Relancer » : l'équipe a rendu la demande à l'exécuteur. */
  "card_payment.retried": fact(payload({ subjectLabel: subjectLabel(), generation: generation() })),
  /** « Rendu autrement » : l'équipe a rendu l'argent hors de la plateforme, motif à l'appui. */
  "card_payment.settled_elsewhere": fact(
    payload({ subjectLabel: subjectLabel(), amountCents: cents(), reason: z.string().min(1) }),
  ),
  /**
   * Un événement du prestataire hors de nos sujets : aucune ligne ne porte son
   * paiement, aucun sujet ne le revendique. Le sujet est l'événement lui-même
   * (`<compte>:<evt_…>`) ; pas une anomalie en soi.
   */
  "card_payment.unmatched": fact(
    payload({ account: z.string().min(1), eventType: z.string().min(1) }),
  ),
} as const;
