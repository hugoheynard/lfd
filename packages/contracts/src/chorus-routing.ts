import { z } from "zod";

import type { StaffActorView } from "./admin-company.js";

/**
 * **Le moment où l'engagement budgétaire se donne** (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD1) :
 *
 * - `at_order` : le numéro se saisit à chaque commande (le défaut) ;
 * - `on_period_quote` : la commande se passe sans numéro, et le numéro arrive
 *   sur le devis de la période. Permis seulement si l'engagement est exigé et
 *   qu'une mercuriale est active chez le payeur.
 *
 * Valeurs écrites en base (`company_chorus_routing.commitment_timing`) : elles
 * ne se renomment pas.
 */
export const COMMITMENT_TIMINGS = ["at_order", "on_period_quote"] as const;
export type CommitmentTiming = (typeof COMMITMENT_TIMINGS)[number];

/** Les codes des refus de la fiche Chorus Pro (`AppError.code`). */
export const CHORUS_ROUTING_ERRORS = {
  /** 400 — `on_period_quote` sans engagement exigé : il n'y aurait rien à attendre. */
  quoteWithoutCommitment: "account.chorus_routing.quote_without_commitment",
  /** 409 — `on_period_quote` sans mercuriale active chez le payeur au jour du geste. */
  quoteWithoutMercuriale: "account.chorus_routing.quote_without_mercuriale",
  /** 409 — changement de mode alors qu'une commande au compte du payeur n'est pas facturée. */
  timingLockedByOrders: "account.chorus_routing.timing_locked_by_orders",
} as const;

/**
 * **La fiche Chorus Pro** d'un organisme public : ce que l'acheteur exige sur
 * ses factures, relevé à la main par le staff dans l'annuaire Chorus. Elle ne
 * se pose que sur une société dont la forme juridique est publique
 * (`isPublicLegalForm`) ; le délai de paiement ne s'y saisit pas, il se dérive
 * de la forme (`publicPaymentDeadlineDays`).
 *
 * Doc : `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`, § 6 bis.
 */
export const chorusRoutingPayloadSchema = z.object({
  /** L'acheteur exige-t-il un numéro d'engagement juridique sur chaque facture ? */
  commitmentRequired: z.boolean(),
  /** Exige-t-il un code service ? */
  serviceCodeRequired: z.boolean(),
  /**
   * Le code service proposé par défaut, ou la chaîne vide : un code exigé sans
   * défaut se saisira à la commande.
   */
  defaultServiceCode: z.string(),
  /** Le moment de l'engagement : à la commande, ou sur le devis de la période. */
  commitmentTiming: z.enum(
    COMMITMENT_TIMINGS,
    "moment de l'engagement : at_order ou on_period_quote",
  ),
  /** Le jour du relevé dans l'annuaire, `AAAA-MM-JJ`. */
  checkedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, "date du relevé attendue au format AAAA-MM-JJ"),
});
export type ChorusRoutingPayload = z.infer<typeof chorusRoutingPayloadSchema>;

/** La fiche Chorus Pro telle que la fiche staff la montre. */
export interface ChorusRoutingView {
  readonly commitmentRequired: boolean;
  readonly serviceCodeRequired: boolean;
  /** Vide quand aucun code n'est proposé par défaut. */
  readonly defaultServiceCode: string;
  readonly commitmentTiming: CommitmentTiming;
  /** `AAAA-MM-JJ`. */
  readonly checkedOn: string;
  /** L'agent qui a relevé la fiche, tel que figé ce jour-là. */
  readonly checkedBy: StaffActorView;
}
