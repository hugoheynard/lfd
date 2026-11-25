/**
 * **Déposer une fiche de fonction** sur un événement. Les octets arrivent
 * bruts : `FunctionSheetPdf` les refuse ou les reconnaît.
 */
export class DepositFunctionSheetCommand {
  constructor(
    readonly eventId: string,
    readonly bytes: Buffer | null,
    /** Le nom annoncé par le navigateur — gardé pour l'affichage seulement. */
    readonly fileName: string,
    /** Le type annoncé par le navigateur — recoupé avec les octets. */
    readonly declaredContentType: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
    /** La clé que l'écran a fabriquée pour CE dépôt : un envoi rejoué ne dépose qu'une fiche. */
    readonly intentKey: string,
  ) {}
}
