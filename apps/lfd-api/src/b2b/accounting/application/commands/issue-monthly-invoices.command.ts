/**
 * **Émet les factures d'une période** (plans
 * `documentation/comptabilite/facturation/facture-emise.md` et
 * `plan-rythme-de-facturation.md`, R3) : une facture 380 par payeur légal et
 * par mandat effectif, sur ses bons passés au compte avant la clôture (Q2,
 * `createdAt`), datée de la veille de la clôture.
 *
 * Par la comptabilité (le bouton « Émettre les factures de … ») ou par le
 * passage automatique, la veille de la clôture à 23h55 : la MÊME commande.
 * Rejouable — une facture déjà émise pour cette clôture (payeur × mandat) ne
 * l'est pas deux fois.
 *
 * Le nom dit encore « Monthly » : toute la famille le porte (tables
 * `invoice_monthly_outcome`, ports, route `monthly-invoices`, contrat
 * `MonthlyInvoicesView`) ; la renommer est un geste à part, pas une moitié.
 */
export class IssueMonthlyInvoicesCommand {
  constructor(
    readonly legalEntityId: string,
    /** ISO 8601 — la clôture de la période facturée, une clôture du rythme de l'entité. */
    readonly periodClosesAt: string,
  ) {}
}
