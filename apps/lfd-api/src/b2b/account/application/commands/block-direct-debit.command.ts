/**
 * Commande **staff** (comptabilité) : bloquer le prélèvement mensuel d'une
 * société. Le crédit accordé est conservé ; les commandes à venir se règlent
 * par carte. Plan : `documentation/comptabilite/plan-blocage-prelevement-et-liens-de-paiement.md` §1.
 *
 * Aucun mur membership : `b2b_deferred_payment_block:write` garde la route.
 */
export class BlockDirectDebitCommand {
  constructor(
    readonly companyId: string,
    /** L'id de la fiche staff qui bloque — il est posé sur la société. */
    readonly staffUserId: string,
    /** Pourquoi : lu par l'agent suivant avant de débloquer. */
    readonly reason: string,
  ) {}
}
