import type { IdempotencyClaim } from "./order-idempotency.store.js";

export type { IdempotencyClaim };

/**
 * **Le registre des clés de la boutique publique.**
 *
 * ## Pourquoi un second registre, et pas une colonne de plus sur le premier
 *
 * Celui du client connecté est muré par `user_id`, avec clé étrangère et
 * `@@unique([userId, key])` : une clé n'y est jamais partagée entre deux
 * personnes, et deviner celle d'un autre ne mène nulle part. Ce mur repose sur
 * une identité que la surface publique n'a pas — et le desserrer pour lui faire
 * de la place en ferait perdre le bénéfice **aux clients connectés**, qui sont
 * ceux qui en profitent aujourd'hui. Le plan l'a tranché (§5) : la surface
 * publique a la sienne, l'existante n'est pas touchée.
 *
 * ## Ce qui remplace le mur, et ce qui ne le remplace pas
 *
 * La clé seule identifie la ligne. Il n'y a donc **rien à deviner qui rapporte
 * quelque chose** : un rejeu ne rend que l'identifiant et le numéro de la
 * commande sortie de cette clé — jamais un `clientSecret`.
 *
 * 🔴 **C'est la différence décisive avec le chemin connecté**, et elle est la
 * raison d'être de ce port séparé. `PlaceOrderHandler.replay()` redemande
 * l'intention à Stripe et rend un secret de paiement **vivant** : légitime
 * derrière un jeton, c'est une passoire sans. Le couple (clé, e-mail) a été
 * écarté pour exactement ce motif — la clé est choisie par le client, l'adresse
 * se tape (plan §5, objection B4). Ici, ce n'est pas une règle qu'on applique :
 * le rejeu n'a aucun moyen d'en produire un.
 *
 * Le reste de la mécanique est celle du premier registre, et pour les mêmes
 * raisons : l'empreinte distingue un rejeu d'une clé réutilisée sur un panier
 * corrigé, et le bail reprend une clé qu'un crash a laissée en vol.
 */
export abstract class ShopOrderIdempotencyStore {
  /**
   * Réclame la clé pour ce panier.
   *
   * @param fingerprint empreinte du panier demandé — un rejeu porte la même, une
   * réutilisation sur un panier corrigé n'en porte pas.
   */
  abstract claim(key: string, fingerprint: string, now: Date): Promise<IdempotencyClaim>;

  /**
   * **Rend** la clé — et seulement quand rien n'a été écrit.
   *
   * Le critère est la POSITION dans le handler, jamais la nature de l'erreur :
   * un refus levé avant la persistance doit pouvoir être corrigé et renvoyé.
   */
  abstract release(key: string): Promise<void>;

  /**
   * **Résout** la clé : voilà la commande qui en est sortie.
   *
   * À n'appeler que dans l'unité de travail qui écrit la commande. Appelée
   * seule, elle rouvrirait la seule fenêtre que ce dispositif ferme — la
   * commande existe, la clé n'est pas résolue : ni rendable, ni reprenable.
   */
  abstract resolve(key: string, orderId: string): Promise<void>;
}
