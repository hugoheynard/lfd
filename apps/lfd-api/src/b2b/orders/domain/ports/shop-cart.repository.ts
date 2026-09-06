import type { ShopCartPayload, ShopCartView } from "@lfd/contracts";

/**
 * Le **panier en cours** d'un client — composé sur un appareil, retrouvé sur un
 * autre.
 *
 * Pas d'agrégat derrière ce port, et pour la même raison que le brouillon du
 * back-office : un panier n'a **aucun invariant à protéger**. Les invariants
 * (au moins une ligne, un acheminement) sont ceux d'une commande *passée*, et
 * les exiger d'un panier reviendrait à interdire de réfléchir. Lui donner une
 * entité serait de la cérémonie autour d'un `upsert`.
 *
 * **Il n'y a pas d'effacement**, et c'est une conséquence, pas un oubli : un
 * panier vidé est un panier À ZÉRO LIGNE, pas un panier absent. La distinction
 * porte tout le multi-appareil — sans ligne en base, « j'ai tout retiré sur mon
 * téléphone » ne se distingue pas de « je n'ai jamais rien composé », et
 * l'ordinateur ressusciterait le panier de la veille. Le compte effacé, lui,
 * emporte la ligne par cascade.
 *
 * **Un panier par personne**, jamais un par société : c'est celui qui compose
 * qu'on sert. Le brouillon du back-office fait l'inverse, et c'est la seule
 * différence entre les deux — là-bas une équipe sert un compte, ici une personne
 * remplit son propre panier.
 */
export abstract class ShopCartRepository {
  /** Le panier de cette personne, ou `null` si elle n'en a jamais posé. */
  abstract find(userId: string): Promise<ShopCartView | null>;

  /**
   * Écrit le panier — création ou remplacement. Rend la vue enregistrée, sans
   * relire : l'écran affiche la date de mise de côté sans un aller-retour de
   * plus.
   */
  abstract save(userId: string, payload: ShopCartPayload): Promise<ShopCartView>;
}
