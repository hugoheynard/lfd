/**
 * « Retours contrôlés » (plan `plan-page-procedure-de-prelevement.md` § 1.2,
 * P3) : le fichier d'impayés de la banque a été lu pour ce jour, retours ou
 * non. `day` absent : aujourd'hui (Paris).
 */
export class AttestBankReturnCheckCommand {
  constructor(
    readonly legalEntityId: string,
    readonly day: string | null,
    readonly staffUserId: string,
  ) {}
}
