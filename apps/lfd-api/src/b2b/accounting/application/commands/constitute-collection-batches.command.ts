/**
 * Constitue les lots de prélèvement d'une entité pour le dernier cycle clos —
 * un lot par schéma qui a des lignes (plan `plan-lot-de-prelevement-fige.md`,
 * §4). Manuelle, par la comptabilité (Q1).
 *
 * Rend les identifiants des lots créés — vide si la constitution n'a fait
 * qu'écarter des commandes.
 */
export class ConstituteCollectionBatchesCommand {
  constructor(
    readonly legalEntityId: string,
    /** Fiche staff LOCALE — jamais un `sub`. */
    readonly staffUserId: string,
  ) {}
}
