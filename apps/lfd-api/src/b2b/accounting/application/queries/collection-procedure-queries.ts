/**
 * **La procédure de prélèvement** d'une entité : l'état calculé des quatre
 * onglets, le lot suivi et les lots ouverts (plan
 * `plan-page-procedure-de-prelevement.md`, S1). `batchId` : le lot que
 * l'adresse désigne ; `null` = celui que la règle du § 4.3 choisit.
 */
export class GetCollectionProcedureQuery {
  constructor(
    readonly legalEntityId: string,
    readonly batchId: string | null,
  ) {}
}
