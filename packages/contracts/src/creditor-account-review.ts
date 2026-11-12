import { z } from "zod";

/**
 * **Le compte créancier aux quatre yeux** (plan
 * `le-paiement-par-virement.md`, T0).
 *
 * La première saisie du compte d'une entité est prise tout de suite ; chaque
 * modification suivante (IBAN, BIC, titulaire, adresse) attend la
 * confirmation d'un AUTRE membre de la comptabilité, qui ressaisit l'IBAN à
 * l'aveugle depuis le RIB de la banque. Tant qu'elle attend, factures, lots
 * et mandats gardent le compte confirmé.
 */

/**
 * La proposition en attente, telle que la fiche la montre.
 *
 * 🔴 L'IBAN proposé n'en sort que par ses quatre derniers caractères, comme le
 * compte confirmé. Le second membre ne le lit donc pas : il le ressaisit.
 */
export interface PendingCreditorAccountView {
  /** L'identifiant de la saisie — la confirmation et l'annulation le citent. */
  readonly id: string;
  readonly last4: string;
  readonly bic: string;
  readonly holder: string;
  readonly line1: string;
  readonly line2: string;
  readonly postalCode: string;
  readonly city: string;
  readonly countryCode: string;
  /** L'id de la fiche staff qui a proposé — l'écran le compare à la sienne. */
  readonly proposedByStaffId: string;
  /** « Prénom Nom », ou `null` si la fiche ne se résout plus. */
  readonly proposedByName: string | null;
  /** ISO. */
  readonly proposedAt: string;
}

/**
 * La confirmation : l'IBAN **ressaisi** depuis le RIB de la banque. Il doit
 * être identique à celui de la proposition ; un refus ne dit pas où il diffère.
 */
export const confirmCreditorAccountPayloadSchema = z.object({
  iban: z.string().trim().min(1),
});
export type ConfirmCreditorAccountPayload = z.infer<typeof confirmCreditorAccountPayloadSchema>;
