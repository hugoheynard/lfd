import type { ChorusDeposit } from "../entities/chorus-deposit.js";

/**
 * Port d'ÉCRITURE du dépôt Chorus d'une facture (plan
 * `plan-clients-publics-chorus.md`, T2′) : charger l'agrégat (la facture et
 * son journal), puis écrire ses lignes neuves. Append-only : `save` n'ajoute
 * que `pending()`, jamais une mise à jour.
 */
export abstract class ChorusDepositRepository {
  /** `null` : la pièce n'existe pas. */
  abstract load(invoiceId: string): Promise<ChorusDeposit | null>;
  abstract save(deposit: ChorusDeposit): Promise<void>;
}
