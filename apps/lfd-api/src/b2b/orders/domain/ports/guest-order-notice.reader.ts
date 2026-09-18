/**
 * **De quoi décider s'il faut prévenir quelqu'un** qu'une commande vient d'être
 * passée avec son adresse — plan
 * `documentation/order/plan-commande-sans-compte.md`, D7.
 *
 * ## Pourquoi un port de plus, et pas `OrderRecipientReader`
 *
 * Celui-là répond « à qui écrire pour cette commande » ; celui-ci répond « faut-il
 * prévenir un TIERS ». Deux questions, deux réponses, et surtout deux raisons de
 * changer : le jour où l'on cessera de prévenir, ce port disparaît sans toucher
 * l'accusé de réception. C'est l'ISP là où on l'oublie — sur les dépendances
 * qu'on prend « parce qu'elles existent déjà ».
 *
 * ## Une seule question, et non deux
 *
 * L'abonné a besoin de savoir que le porteur est un **invité** (sinon il n'y a
 * personne à prévenir : la commande vient d'un compte, qui est son propre
 * destinataire) ET qu'un **compte connectable** porte la même adresse (sinon il
 * n'y a personne d'autre à qui écrire). Les deux se lisent dans la même table,
 * au même instant : les poser en deux appels ferait deux vérités qui peuvent
 * diverger entre-temps.
 */

/** Ce qu'il faut pour écrire au propriétaire probable d'une adresse. */
export interface GuestOrderNotice {
  readonly email: string;
  /** Le prénom du COMPTE existant — celui qu'on salue, pas celui tapé au panier. */
  readonly firstName: string;
}

export abstract class GuestOrderNoticeReader {
  /**
   * Qui prévenir pour cette commande, ou `null` — et `null` est le cas normal.
   *
   * Rend `null` dès que l'une des deux conditions manque : le porteur n'est pas
   * un invité, ou aucun compte connectable ne porte son adresse.
   *
   * 🔴 **Rien de ce que rend ce port ne doit atteindre la réponse HTTP.** Il
   * répond à une question que seul un envoi de fond a le droit de poser : dire
   * au client qui commande qu'un compte existe sous cette adresse serait de
   * l'énumération de comptes, et chez nous cette information est commerciale —
   * qui teste des adresses apprendrait qui se fournit ici (D7).
   */
  abstract noticeFor(placedByUserId: string): Promise<GuestOrderNotice | null>;
}
