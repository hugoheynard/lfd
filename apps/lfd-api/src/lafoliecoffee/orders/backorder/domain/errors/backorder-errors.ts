import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../../platform/shared/errors/app-error.js";

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

/** Un reliquat naît des lignes de son origine : un article absent dit une donnée corrompue. */
export class BackorderOriginLineMissingError extends TechnicalError {
  constructor(sku: string) {
    super(
      "orders.backorder.origin_line_missing",
      `L'article « ${sku} » du reliquat ne figure pas sur la commande d'origine : son prix d'origine est introuvable, ` +
        "rien n'a été transformé. Prévenir l'équipe technique.",
    );
  }
}

/** Le reliquat demandé n'existe pas. */
export class BackorderNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "orders.backorder.not_found",
      `Le reliquat ${id} est introuvable. Rechargez la commande d'origine pour voir son reliquat.`,
    );
  }
}

/** La commande d'origine d'un reliquat est introuvable : sa clé étrangère l'interdit. */
export class BackorderOriginNotFoundError extends TechnicalError {
  constructor(originOrderId: string) {
    super(
      "orders.backorder.origin_not_found",
      `La commande d'origine ${originOrderId} du reliquat est introuvable : rien n'a été transformé. ` +
        "Prévenir l'équipe technique.",
    );
  }
}

/**
 * Un reliquat de particulier se transforme par ses gestes à lui — réglée en
 * boutique ou offerte (plan, § 5 bis) —, pas par la saisie de l'équipe, qui
 * exige une société.
 */
export class ParticularBackorderNotConvertibleError extends BusinessError {
  constructor() {
    super(
      "orders.backorder.particular_not_convertible",
      "Ce reliquat est celui d'un particulier : il ne se transforme pas par la saisie pour une société. " +
        "Choisissez « Réglée en boutique » ou « Offerte » sur la fiche de la commande d'origine.",
    );
  }
}

/**
 * Un reliquat de pro se transforme par la saisie de l'équipe, avec son
 * règlement : la caisse de la boutique et l'offerte du particulier ne
 * s'appliquent pas à une société.
 */
export class CompanyBackorderNeedsStaffEntryError extends BusinessError {
  constructor() {
    super(
      "orders.backorder.company_needs_staff_entry",
      "Ce reliquat est celui d'une société : il ne se règle ni à la caisse de la boutique ni comme une offerte à un particulier. " +
        "Utilisez « Transformer » sur la fiche de la commande d'origine.",
    );
  }
}

/**
 * L'annulation d'une commande abandonne son reliquat ouvert, et l'abandon
 * nomme un membre de l'équipe : un client ne l'annule pas à sa place.
 */
export class BackorderAbandonNeedsStaffError extends BusinessError {
  constructor() {
    super(
      "orders.backorder.abandon_needs_staff",
      "Cette commande a un reliquat en attente : seule l'équipe peut l'annuler, en abandonnant ce reliquat. " +
        "Rien n'a été annulé ; contactez La Folie Coffee.",
    );
  }
}
