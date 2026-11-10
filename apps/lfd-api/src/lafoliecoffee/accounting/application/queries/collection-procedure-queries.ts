/**
 * **La procédure de prélèvement** d'une entité : l'état calculé des quatre
 * onglets, le lot suivi et les lots ouverts (plan
 * `plan-page-procedure-de-prelevement.md`, S1). `batchId` : le lot que
 * l'adresse désigne ; `closureDay` : la clôture de la procédure ouverte
 * depuis la liste (§ 11) ; les deux `null` = le lot que la règle du § 4.3
 * choisit sur toute l'entité.
 */
export class GetCollectionProcedureQuery {
  constructor(
    readonly legalEntityId: string,
    readonly batchId: string | null,
    readonly closureDay: string | null = null,
  ) {}
}

/**
 * **La liste des procédures** d'une entité (§ 11) : ouvertes, à venir, et
 * — `includeClosed` — les closes des trois derniers mois.
 */
export class ListCollectionProceduresQuery {
  constructor(
    readonly legalEntityId: string,
    readonly includeClosed: boolean,
  ) {}
}
