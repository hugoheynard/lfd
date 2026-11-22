import type { CardCollection } from "@lfd/contracts";

/** Ce qu'une réponse qui fait payer par carte porte de la collecte. */
export interface CardCollectionFields {
  readonly collection: CardCollection;
  readonly clientSecret?: string;
  readonly publishableKey?: string;
}

/**
 * **L'instruction de collecte, et les deux champs qu'elle remplace** (plan
 * `documentation/payment/liens-de-paiement/plan-le-lien-vers-un-sujet.md`,
 * §2.3 bis). `clientSecret` et `publishableKey` restent servis un déploiement
 * de plus, pour une page de la boutique ouverte avant l'instruction ; ils ne
 * se remplissent que pour une collecte `embedded`, la seule qu'ils savaient
 * dire. Rien n'est inventé pour une redirection.
 */
export function cardCollectionFields(collection: CardCollection): CardCollectionFields {
  if (collection.kind !== "embedded") {
    return { collection };
  }
  return {
    collection,
    clientSecret: collection.token,
    publishableKey: collection.publishableKey,
  };
}
