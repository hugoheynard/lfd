/**
 * L'émetteur, **figé au jour où le document a été produit**.
 *
 * C'est une copie, jamais une référence, et c'est tout l'objet du type. Un
 * mandat signé en 2026 porte l'adresse de 2026 : le jour où le siège déménage,
 * le papier que le client a signé continue de dire ce qu'il dit, et la facture
 * de mars ne change pas de mentions en avril. Résoudre l'émetteur à la lecture
 * réécrirait rétroactivement des documents opposables.
 *
 * C'est le même motif que le `buyer_snapshot` de la facture et que le SKU
 * recopié sur une `OrderLine` — la référence croisée par identifiant opaque plus
 * copie, jamais par jointure vivante.
 */
export interface CreditorSnapshot {
  /** L'entité d'origine — opaque, pour retrouver la fiche, jamais pour relire. */
  readonly legalEntityId: string;
  readonly name: string;
  readonly legalForm: string;
  readonly siren: string;
  readonly vatNumber: string;
  readonly rcs: string;
  readonly shareCapitalCents: number;
  /** Les lignes d'adresse, prêtes à imprimer, sans les vides. */
  readonly addressLines: readonly string[];
  /** L'ICS, imprimé sur le mandat : c'est lui que le débiteur opposera. */
  readonly ics: string;
  /** Le compte où l'argent arrive — sur la facture, pas sur le mandat. */
  readonly creditorIban: string;
  /** Le délai annoncé entre la notification et le débit, en jours. */
  readonly preNotificationDays: number;
}
