/**
 * **Émet les factures d'un mois** (plan
 * `documentation/comptabilite/facturation/plan-emission-de-la-facture.md`, lot E4) : une
 * facture 380 par payeur légal, sur ses bons passés au compte dans le mois
 * (Q2, `createdAt`), datée du dernier jour du mois.
 *
 * Par la comptabilité (le bouton « Émettre les factures de … ») ou par le
 * passage automatique, le dernier jour à 22h : la MÊME commande. Rejouable —
 * un payeur déjà facturé pour ce mois ne l'est pas deux fois.
 */
export class IssueMonthlyInvoicesCommand {
  constructor(
    readonly legalEntityId: string,
    /** `AAAA-MM` — le mois des COMMANDES. */
    readonly month: string,
  ) {}
}
