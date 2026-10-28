import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
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

/** L'article se vend au poids : un réassort ne compte que des pièces (`vente-au-poids.md`). */
export class WeightArticleInResupplyError extends BusinessError {
  constructor(readonly sku: string) {
    super(
      "resupply.weight_article",
      `L'article ${sku} se vend au poids, et un réassort ne se compte qu'en pièces. ` +
        "Choisissez un autre article de la liste.",
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

/**
 * Le réassort est déjà réceptionné. Refusé plutôt qu'ignoré : un second
 * « Réceptionner » vient d'un autre poste, et le dire évite de croire qu'on
 * a soi-même attesté l'arrivée.
 */
export class ResupplyAlreadyReceivedError extends BusinessError {
  constructor(byName: string, atLabel: string) {
    super(
      "resupply.receipt.already_received",
      `Ce réassort est déjà réceptionné${byName === "" ? "" : ` par ${byName}`} (${atLabel}) : rechargez la page, puis corrigez une ligne s'il y a un écart.`,
    );
  }
}

/**
 * Le réassort vise une journée qui n'est pas encore venue (lot R1d, trou
 * laissé par R2) : « Réceptionner » aujourd'hui un réassort de demain
 * compterait au stock d'un jour où la vitrine ne l'a pas.
 */
export class ResupplyDayNotYetComeError extends BusinessError {
  constructor(readonly serviceDay: string) {
    super(
      "resupply.receipt.day_not_yet_come",
      `Ce réassort est pour le ${serviceDay}, une journée qui n'est pas encore venue : il se réceptionne ce jour-là, à son arrivée. S'il est déjà là, saisissez-le dans « Réassort sans commande » d'aujourd'hui.`,
    );
  }
}

/** Un écart ne se corrige qu'après « Réceptionner » : avant, rien n'est reçu. */
export class ReceiptNotYetReceivedError extends BusinessError {
  constructor() {
    super(
      "resupply.receipt.not_yet_received",
      "Ce réassort n'est pas encore réceptionné : cliquez d'abord sur « Réceptionner », puis corrigez la ligne où il y a un écart.",
    );
  }
}

/** Un reçu de réassort porte les lignes du réassort, et elles seules. */
export class ReceiptBoundToResupplyError extends BusinessError {
  constructor() {
    super(
      "resupply.receipt.bound_to_resupply",
      "Ce reçu suit un réassort commandé : on n'y ajoute ni n'en retire d'article. Saisissez l'article arrivé en plus dans « Réassort sans commande », ou mettez la quantité reçue à zéro.",
    );
  }
}

/** Seul un réassort envoyé et non annulé se réceptionne. */
export class ResupplyNotReceivableError extends BusinessError {
  constructor() {
    super(
      "resupply.receipt.resupply_not_receivable",
      "Ce réassort n'a pas été envoyé au fournil, ou a été annulé : il n'y a rien à réceptionner. Saisissez ce qui est arrivé dans « Réassort sans commande ».",
    );
  }
}

/**
 * Un reçu encore attendu n'a rien à écrire : seul « Réceptionner » le fait
 * exister en base. Arriver ici est un défaut de programmation.
 */
export class UnreceivedReceiptNotPersistableError extends TechnicalError {
  constructor() {
    super(
      "resupply.receipt.unreceived_not_persistable",
      "Un reçu de réassort ne s'enregistre qu'une fois réceptionné : le geste n'a rien écrit. Rechargez la page et réessayez ; si cela se reproduit, signalez-le.",
    );
  }
}
