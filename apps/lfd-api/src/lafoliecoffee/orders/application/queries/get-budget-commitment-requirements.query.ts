/**
 * **Ce que le payeur d'une commande exigerait de l'engagement budgétaire**,
 * pour l'écran de passation (P2). `companyId` : la société qui commande —
 * l'espace actif du client, ou celle que l'équipe saisit ; `null` : une
 * commande personnelle, sans payeur public.
 */
export class GetBudgetCommitmentRequirementsQuery {
  constructor(readonly companyId: string | null) {}
}
