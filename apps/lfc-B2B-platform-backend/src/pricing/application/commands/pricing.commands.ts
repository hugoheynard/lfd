import type { PriceFloorPolicy } from "../../domain/floor-policy.js";
import type { PriceScope } from "../../domain/price-rule.js";
import type { PricingRuleDraft } from "../../domain/entities/pricing-rule.js";

/**
 * Une commande par **geste**, nommée comme le geste.
 *
 * Poser une règle et retirer une règle sont deux intentions différentes, et
 * poser un plancher n'est pas poser une règle. Un `UpdatePricingCommand`
 * générique aurait été plus court et aurait perdu la seule chose qui compte
 * dans six mois : ce que l'utilisateur croyait faire.
 */
export class CreatePriceRuleCommand {
  constructor(
    readonly draft: PricingRuleDraft,
    readonly staffSub: string,
  ) {}
}

/**
 * **Suspendre** une promotion — elle cesse d'agir et garde sa place.
 *
 * Un geste à part, et non un `PUT { active: false }` : la question qu'on posera
 * dans six mois est « qui a arrêté la promo du 12 août », et seule une intention
 * nommée y répond. Un champ modifié ne dit pas ce que l'utilisateur croyait
 * faire.
 */
export class PausePriceRuleCommand {
  constructor(
    readonly id: string,
    readonly staffSub: string,
    readonly reason: string | null,
  ) {}
}

/** **Reprendre** : elle réagit, à partir de maintenant. */
export class ResumePriceRuleCommand {
  constructor(
    readonly id: string,
    readonly staffSub: string,
  ) {}
}

/**
 * **Archiver** — terminal, et le seul geste qui retire une règle de l'écran.
 *
 * Il n'y a pas de suppression : une règle a facturé, elle a fait un prix, et
 * l'effacer effacerait la réponse à « pourquoi ce prix » alors que la facture,
 * elle, reste.
 */
export class ArchivePriceRuleCommand {
  constructor(
    readonly id: string,
    readonly staffSub: string,
    readonly reason: string | null,
  ) {}
}

export class SetPriceFloorCommand {
  constructor(
    readonly scope: PriceScope,
    readonly policy: PriceFloorPolicy,
    readonly staffSub: string,
  ) {}
}

/**
 * **Confirmer** une limite sans la changer.
 *
 * Un geste à part entière, et pas un `PUT` déguisé : il dit « j'ai regardé
 * l'écart, et je maintiens ». Sans lui, la seule façon d'éteindre le signal de
 * dérive serait de modifier la limite — donc de changer une décision pour faire
 * taire un rappel, ce qui est exactement l'inverse du but.
 */
export class ConfirmPriceFloorCommand {
  constructor(
    readonly scope: PriceScope,
    readonly staffSub: string,
  ) {}
}

/** **Archiver** une limite. Même raison que pour une règle : rien ne s'efface. */
export class ArchivePriceFloorCommand {
  constructor(
    readonly scope: PriceScope,
    readonly staffSub: string,
    readonly reason: string | null,
  ) {}
}
