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
 * **Un panier par personne ET par espace de travail** (depuis le 2026-09-15) :
 * `companyId` `null` est le perso, sinon la société pour laquelle elle compose.
 * C'est toujours celui qui compose qu'on sert — le brouillon du back-office, lui,
 * appartient à la société et se partage dans l'équipe —, mais changer d'espace
 * ne mélange plus les lignes d'une maison avec celles d'une autre.
 *
 * `companyId` vient de la société agissante résolue par la porte, jamais d'un
 * corps de requête : ce port ne revérifie pas le rattachement.
 */
export abstract class ShopCartRepository {
  /** Le panier de cette personne dans cet espace, ou `null` s'il n'y en a pas. */
  abstract find(userId: string, companyId: string | null): Promise<ShopCartView | null>;

  /**
   * Écrit le panier de cet espace — création ou remplacement, atomique : deux
   * écritures simultanées du même espace ne lèvent rien, la dernière gagne. Rend
   * la vue enregistrée, sans relire : l'écran affiche la date de mise de côté
   * sans un aller-retour de plus.
   */
  abstract save(
    userId: string,
    companyId: string | null,
    payload: ShopCartPayload,
  ): Promise<ShopCartView>;
}
