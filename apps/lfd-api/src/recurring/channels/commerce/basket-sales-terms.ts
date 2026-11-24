/** La version des CGV en vigueur pour une clientèle : ce qu'un panier enregistre à l'ouverture. */
export interface SalesTermsInForce {
  /** Le texte de la clientèle (`salesTerms`, `salesTermsPro`). */
  readonly key: string;
  /** La révision en ligne, `null` si le texte n'a jamais été publié. */
  readonly revision: number | null;
  readonly fileId: string | null;
}

/**
 * **Les CGV en vigueur pour l'acheteur d'un panier** — déclaré par les
 * paniers récurrents, implémenté par le commerce, qui seul sait quelle
 * clientèle une société désigne (plan `plan-bloc-recurrent.md`, § 7).
 */
export abstract class BasketSalesTerms {
  /** `companyId` `null` : un panier perso, aux CGV des particuliers. */
  abstract inForceFor(companyId: string | null): Promise<SalesTermsInForce>;
}
