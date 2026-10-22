/**
 * Déclare une société cliente parmi nos établissements (plan
 * `plan-prelevement-d-essai.md`, Q1) — la seule porte du prélèvement d'essai.
 */
export class DeclareOwnEstablishmentCommand {
  constructor(
    readonly companyId: string,
    readonly staffUserId: string,
  ) {}
}
