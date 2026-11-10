/**
 * Une identité publique, telle que le panier la recueille : trois champs, et
 * rien de plus. C'est exactement ce que l'écran demande à un visiteur qui refuse
 * de créer un compte (plan `architecture-commande-sans-compte.md` §8 bis).
 */
export interface GuestBuyer {
  readonly firstName: string;
  readonly email: string;
  readonly phone: string;
}

/**
 * **Inscrire le porteur d'une commande publique** — et rien d'autre.
 *
 * ## Pourquoi un porteur, alors que la commande pourrait s'en passer
 *
 * Elle ne le peut pas. `Order.placedByUserId` est non nullable, et le rendre
 * nullable touchait 29 fichiers, un contrat de canal publié et trois événements
 * de domaine — dont trois abonnés de croissance qui auraient fait tomber toutes
 * les commandes publiques sur un acheteur fictif unique, en silence et sans
 * qu'une ligne rougisse (plan §3.1). La voie retenue est l'inverse : un `User`
 * **réel**, simplement sans identité de connexion.
 *
 * Et c'est ce qui fait marcher tout le reste sans une ligne de changement : le
 * courriel de confirmation, le QR de retrait et la fiche de commande passent
 * tous par `OrderRecipientReader.findById(userId)`, qui lit cette personne-là.
 * Sans elle, le client public n'aurait eu ni confirmation, ni code à présenter
 * au comptoir (plan §5 et lot D).
 *
 * ## Port étroit, et volontairement asymétrique
 *
 * Une **écriture** seule : la commande publique n'a rien à lire de l'annuaire —
 * elle n'a personne à reconnaître. Un port qui saurait aussi chercher par
 * adresse serait la voie 3.2 déguisée : retrouver quelqu'un par son e-mail sur
 * une surface publique, c'est laisser n'importe qui commander sous le compte
 * d'un autre en tapant son adresse. Ne pas pouvoir chercher est ici une
 * propriété, pas une limite.
 */
export abstract class GuestBuyerRegistrar {
  /**
   * Inscrit l'invité et rend son identifiant.
   *
   * ⚠️ Cette phrase disait « toujours une ligne neuve, jamais une
   * réconciliation par adresse » (D2). Ce n'est plus vrai : l'adaptateur
   * réutilise la fiche invité de même adresse, **sans identité de connexion**
   * (`PrismaGuestBuyerRegistrar.guestFor`, vérifié le 2026-10-18), ce qui
   * n'ouvre d'accès à personne. Un compte connectable n'est jamais retrouvé
   * par son adresse depuis une surface publique.
   */
  abstract register(buyer: GuestBuyer): Promise<string>;
}
