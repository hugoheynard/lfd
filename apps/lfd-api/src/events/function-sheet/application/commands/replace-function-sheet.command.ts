/**
 * **Remplacer une fiche de fonction** par une version plus récente. Les
 * octets arrivent bruts : `FunctionSheetPdf` les refuse ou les reconnaît.
 */
export class ReplaceFunctionSheetCommand {
  constructor(
    readonly eventId: string,
    /** La fiche en vigueur que la nouvelle version remplace. */
    readonly replacedSheetId: string,
    readonly bytes: Buffer | null,
    /** Le nom annoncé par le navigateur — gardé pour l'affichage seulement. */
    readonly fileName: string,
    /** Le type annoncé par le navigateur — recoupé avec les octets. */
    readonly declaredContentType: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
    /** La clé que l'écran a fabriquée pour CE remplacement : rejoué, il ne range qu'une version. */
    readonly intentKey: string,
  ) {}
}
