import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/** Une quantité reçue qui n'est pas un entier positif ou nul. */
export class InvalidReceivedQuantityError extends DomainError {
  constructor(readonly quantity: number) {
    super(
      "resupply.receipt.invalid_quantity",
      `La quantité reçue doit être un nombre entier, zéro ou plus (reçu : ${String(quantity)}).`,
    );
  }
}

/** Un jour qui n'est pas une date civile `AAAA-MM-JJ`. */
export class InvalidServiceDayError extends DomainError {
  constructor(readonly day: string) {
    super(
      "resupply.receipt.invalid_day",
      `La journée « ${day} » n'est pas une date au format AAAA-MM-JJ.`,
    );
  }
}

/** Une ligne sans SKU ou sans libellé : rien à afficher ni à décompter. */
export class IncompleteReceiptLineError extends DomainError {
  constructor() {
    super(
      "resupply.receipt.incomplete_line",
      "Une ligne reçue porte un article et son libellé : choisissez l'article dans le catalogue.",
    );
  }
}

/**
 * L'article est déjà sur la liste du jour. Refusé plutôt qu'additionné : une
 * seconde saisie du même article est plus souvent un doublon qu'un second
 * arrivage, et la somme silencieuse gonflerait le stock offert.
 */
export class ReceiptLineAlreadyPresentError extends BusinessError {
  constructor(readonly sku: string) {
    super(
      "resupply.receipt.line_already_present",
      `Cet article (${sku}) est déjà sur la liste du jour : corrigez sa quantité plutôt que de l'ajouter une seconde fois.`,
    );
  }
}

/** L'article visé n'est pas sur la liste du jour. */
export class ReceiptLineNotFoundError extends ResourceNotFoundError {
  constructor(readonly sku: string) {
    super(
      "resupply.receipt.line_not_found",
      `L'article ${sku} n'est pas sur la liste reçue de ce jour : rechargez la page.`,
    );
  }
}

/** L'article n'est pas au catalogue publié vendu aux particuliers. */
export class ResupplyArticleUnknownError extends ResourceNotFoundError {
  constructor(readonly sku: string) {
    super(
      "resupply.receipt.article_unknown",
      `L'article ${sku} n'est pas au catalogue publié de la boutique : choisissez un article de la liste.`,
    );
  }
}

/** Le point de retrait n'existe pas, ou est archivé. */
export class ResupplySiteUnknownError extends ResourceNotFoundError {
  constructor(readonly siteId: string) {
    super(
      "resupply.receipt.site_unknown",
      "Ce point de retrait n'existe pas ou a été archivé : choisissez-en un autre.",
    );
  }
}

/** Deux postes ont corrigé la même liste en même temps : le second ne l'écrase pas. */
export class ResupplyReceiptChangedMeanwhileError extends BusinessError {
  constructor() {
    super(
      "resupply.receipt.changed_meanwhile",
      "La liste reçue vient d'être modifiée depuis un autre poste : rechargez la page, puis refaites votre geste.",
    );
  }
}
