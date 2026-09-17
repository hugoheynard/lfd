import type { OrderPaymentIntent, PlaceShopOrderPayload } from "@lfd/contracts";

/**
 * Passe une commande **sans compte** — plan
 * `documentation/b2b/plan-commande-sans-compte.md`, lot C.
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
}
