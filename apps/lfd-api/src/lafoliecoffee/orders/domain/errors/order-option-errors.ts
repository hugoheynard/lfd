import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus des options d'une ligne (« dont 2 tranchés »,
 * `documentation/catalogue/plan-options-de-commande.md`, § 3.3). Lus par du
 * personnel qui saisit à la place du client comme par le client : chacun
 * nomme l'article, le groupe ou le choix, et le geste de sortie.
 */

/** Le groupe n'est pas proposé sur cet article — la fiche ne l'active pas, ou plus. */
export class OptionGroupNotOfferedError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly productName: string,
    readonly group: string,
  ) {
    super(
      "orders.option.group_not_offered",
      `L'article « ${productName} » (${sku}) ne propose pas le groupe d'options « ${group} » : ` +
        "retirez cette option de la ligne, ou faites activer le groupe sur la fiche au référentiel.",
    );
  }
}

/** Le choix n'existe pas dans le groupe, ou n'est pas proposé à la clientèle du client. */
export class OptionChoiceNotOfferedError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly productName: string,
    readonly groupName: string,
    readonly choice: string,
  ) {
    super(
      "orders.option.choice_not_offered",
      `Le choix « ${choice} » du groupe « ${groupName} » n'est pas proposé pour « ${productName} » ` +
        `(${sku}) à la clientèle de ce client : retirez-le de la ligne. Une commande passée pour ` +
        "le client applique sa clientèle, pas celle de l'équipe.",
    );
  }
}

/** Une quantité d'option nulle ou négative — « sans » n'est pas une option, c'est le reste. */
export class OptionQuantityNotPositiveError extends DomainError {
  constructor(
    readonly sku: string,
    readonly choice: string,
    readonly quantity: number,
  ) {
    super(
      "orders.option.quantity_not_positive",
      `L'option « ${choice} » de l'article ${sku} porte la quantité ${String(quantity)} : une ` +
        "option se compte au moins une fois. Retirez-la plutôt que de la mettre à zéro — le reste " +
        "de la ligne est « sans ».",
    );
  }
}

/** La somme d'un groupe dépasse la quantité de la ligne. */
export class OptionQuantityAboveLineError extends DomainError {
  constructor(
    readonly sku: string,
    readonly groupName: string,
    readonly optionsQuantity: number,
    readonly lineQuantity: number,
  ) {
    super(
      "orders.option.quantity_above_line",
      `Le groupe « ${groupName} » de l'article ${sku} compte ${String(optionsQuantity)} unités, ` +
        `pour une ligne de ${String(lineQuantity)} : baissez les options, ou montez la quantité de ` +
        "la ligne.",
    );
  }
}

/** Au poids, un choix vaut pour toute la ligne : sa quantité est celle de la ligne, en grammes. */
export class WeightOptionQuantityError extends DomainError {
  constructor(
    readonly sku: string,
    readonly choice: string,
    readonly quantity: number,
    readonly lineGrams: number,
  ) {
    super(
      "orders.option.weight_quantity",
      `L'article ${sku} se vend au poids : l'option « ${choice} » vaut pour toute la ligne, ` +
        `donc ${String(lineGrams)} g, pas ${String(quantity)}. Envoyez la quantité de la ligne.`,
    );
  }
}

/** Le même choix cité deux fois sur une ligne figée — l'agrégat n'en garde qu'un compte. */
export class DuplicateOptionChoiceError extends DomainError {
  constructor(
    readonly sku: string,
    readonly group: string,
    readonly choice: string,
  ) {
    super(
      "orders.option.duplicate",
      `L'option « ${choice} » du groupe « ${group} » figure deux fois sur la ligne ${sku} : ` +
        "la ligne n'est pas enregistrée. Prévenir l'équipe technique.",
    );
  }
}
