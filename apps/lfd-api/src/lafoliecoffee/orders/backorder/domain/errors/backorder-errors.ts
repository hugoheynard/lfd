import { BusinessError, DomainError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **reliquat de commande** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 2). Lus
 * par l'équipe : chacun nomme le cas et le geste de sortie.
 */

/** Un reliquat naît d'un reste : sans ligne, il n'y a rien à garder. */
export class EmptyBackorderError extends DomainError {
  constructor() {
    super(
      "orders.backorder.empty",
      "Un reliquat garde ce qui n'est pas parti : il en faut au moins un article. " +
        "Tout est parti, il n'y a pas de reliquat à ouvrir.",
    );
  }
}

/** Une ligne de reliquat illisible : article vide, quantité nulle ou négative, unité inconnue. */
export class InvalidBackorderLineError extends DomainError {
  constructor(sku: string, problem: string) {
    super(
      "orders.backorder.invalid_line",
      `La ligne « ${sku === "" ? "sans article" : sku} » du reliquat est refusée : ${problem}. ` +
        "Un reliquat ne garde que des quantités entières et positives (des pièces, ou des grammes au poids).",
    );
  }
}

/** Une commande n'a qu'une ligne par article : le reliquat aussi. */
export class DuplicateBackorderLineError extends DomainError {
  constructor(sku: string) {
    super(
      "orders.backorder.duplicate_line",
      `L'article « ${sku} » figure deux fois dans le reliquat : une ligne par article. ` +
        "Additionnez les quantités en une seule ligne.",
    );
  }
}

/** La commande issue d'un reliquat est une commande neuve, jamais son origine. */
export class BackorderConvertedIntoOriginError extends DomainError {
  constructor() {
    super(
      "orders.backorder.converted_into_origin",
      "Un reliquat se transforme en une commande NEUVE : la commande d'origine ne peut pas être celle qui en est issue.",
    );
  }
}

/** Les deux sorts définitifs, dans les mots du refus. */
const CLOSED_WORDS: Readonly<Record<"converted" | "abandoned", string>> = {
  converted: "déjà transformé en commande",
  abandoned: "déjà abandonné",
};

/** Décision 2 : `converted` et `abandoned` sont définitifs. */
export class BackorderClosedError extends BusinessError {
  constructor(state: "converted" | "abandoned") {
    super(
      "orders.backorder.closed",
      `Ce reliquat est ${CLOSED_WORDS[state]}, et c'est définitif : rien n'a été changé. ` +
        "Rechargez la commande d'origine pour voir son état ; pour livrer encore, passez une commande ordinaire.",
    );
  }
}
