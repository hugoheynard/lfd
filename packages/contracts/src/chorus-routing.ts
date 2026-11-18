import { z } from "zod";

import type { StaffActorView } from "./admin-company.js";

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
  /** `AAAA-MM-JJ`. */
  readonly checkedOn: string;
  /** L'agent qui a relevé la fiche, tel que figé ce jour-là. */
  readonly checkedBy: StaffActorView;
}
