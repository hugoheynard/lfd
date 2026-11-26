/** Ce que la fiche client montre du marquage. */
export interface InHouseDeclarationState {
  /** L'instant du marquage ; `null` quand le payeur n'est pas maison. */
  readonly declaredAt: Date | null;
}

/**
 * Port de **lecture** de la nature « maison » pour la fiche client. Distinct
 * de `InHousePayerReader` : la fiche veut l'instant du marquage et
 * savoir si la société existe, les passations ne demandent qu'un oui ou non.
 */
export abstract class InHouseDeclarationReader {
  /** `null` quand la société n'existe pas. */
  abstract stateOf(companyId: string): Promise<InHouseDeclarationState | null>;
}
