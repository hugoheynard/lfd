/**
 * Un SIRET vient d'être posé ou corrigé sur une société, **après** la
 * validation de l'écriture : un abonné qui relit la société y trouve le
 * nouveau SIRET.
 *
 * Une société déclarée depuis la boutique naît sans SIRET ; c'est ce fait,
 * et non sa déclaration, qui permet d'en résoudre le code NAF.
 */
export class CompanySiretSetEvent {
  constructor(readonly companyId: string) {}
}
