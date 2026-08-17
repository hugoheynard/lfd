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

export class RemovePriceRuleCommand {
  constructor(readonly id: string) {}
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

export class RemovePriceFloorCommand {
  constructor(readonly scope: PriceScope) {}
}
