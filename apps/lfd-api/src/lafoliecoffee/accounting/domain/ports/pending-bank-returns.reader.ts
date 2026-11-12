/**
 * **Un retour bancaire de ce payeur attend-il sa décision ?** (V10) — un
 * retour `pending` sur une ligne d'un lot de l'entité qui débitait ce payeur.
 */
export abstract class PendingBankReturnsReader {
  abstract hasPendingReturn(legalEntityId: string, payerCompanyId: string): Promise<boolean>;
}
