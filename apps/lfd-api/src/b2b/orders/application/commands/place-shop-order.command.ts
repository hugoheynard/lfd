import type { OrderPaymentIntent, PlaceShopOrderPayload } from "@lfd/contracts";

/**
 * Passe une commande **sans compte** — plan
 * `documentation/commandes/architecture-commande-sans-compte.md`, lot C.
 *
 * 🔴 **Aucun acteur en paramètre, et c'est la différence avec
 * `PlaceOrderCommand`.** Là-bas, `actorUserId` vient du jeton et `companyId` du
 * contexte : deux faits que le serveur a établis. Ici, il n'y a rien à établir —
 * personne n'est connecté, et l'identité du payload n'est pas une preuve mais
 * une déclaration. Le porteur n'existe donc pas encore au moment où cette
 * commande est émise : c'est le handler qui l'inscrit.
 *
 * La société n'est pas non plus un paramètre facultatif : elle est **absente du
 * modèle**. Une commande publique n'en a pas, et lui en laisser la place ferait
 * naître la question de savoir qui la remplit.
 */
export class PlaceShopOrderCommand {
  constructor(readonly payload: PlaceShopOrderPayload) {}
}

/**
 * Résultat de la passation publique.
 *
 * `payment` est présent à la **première** passation dès que le total est
 * positif — c'est la carte, toujours. Il est **absent d'un rejeu**, et ce n'est
 * pas une omission : rendre un `clientSecret` depuis une surface publique ferait
 * du couple « clé devinée » un moyen d'obtenir un secret de paiement vivant
 * (plan §5, D4). Un règlement interrompu perd le paiement, pas la commande.
 */
export interface PlaceShopOrderResult {
  readonly id: string;
  readonly orderNumber: string;
  readonly payment?: OrderPaymentIntent;
  /**
   * Les points que CETTE commande aurait rapportés avec un compte — un
   * conditionnel : un invité ne gagne rien. `null` quand elle n'en aurait
   * rapporté aucun, et toujours sur un rejeu, qui ne recompose pas la commande.
   */
  readonly loyaltyPointsWithAccount: number | null;
  /**
   * Le bonus de bienvenue qu'elle recevrait en créant son compte maintenant,
   * avec cette adresse. `null` quand le bonus est éteint ou le programme fermé
   * au public, et toujours sur un rejeu.
   */
  readonly welcomeBonusPoints: number | null;
}
