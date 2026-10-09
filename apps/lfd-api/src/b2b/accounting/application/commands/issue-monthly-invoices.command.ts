/**
 * **Émet les factures d'un mois** (plan
 * `documentation/comptabilite/facturation/facture-emise.md`) :
 * une facture 380 par payeur légal et par mandat effectif, sur ses bons passés au compte dans le mois
 * (Q2, `createdAt`), datée du dernier jour du mois.
 *
 * Par la comptabilité (le bouton « Émettre les factures de … ») ou par le
 * passage automatique, le dernier jour à 23h55 : la MÊME commande. Rejouable —
 * une facture déjà émise pour ce mois (payeur × mandat) ne l'est pas deux fois.
 */
export class IssueMonthlyInvoicesCommand {
  constructor(
    readonly legalEntityId: string,
    /** `AAAA-MM` — le mois des COMMANDES. */
    readonly month: string,
  ) {}
}
