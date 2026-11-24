/**
 * **Une mercuriale agit-elle chez ce payeur à cet instant ?** Déclaré par le
 * compte, implémenté par la tarification (qui seule sait qu'une mercuriale
 * suspendue n'agit pas) ; relié dans `appBootstrap`. Lu par le geste de la
 * fiche Chorus avant le devis de période.
 */
export abstract class PayerLiveMercurialeReader {
  abstract hasLiveMercuriale(companyId: string, at: Date): Promise<boolean>;
}
