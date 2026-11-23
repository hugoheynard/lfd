import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * La portée se contredit : une portée globale qui nomme une cible, ou une portée
 * précise qui n'en nomme aucune.
 *
 * **400 et non 409** : ce n'est pas l'état du monde qui s'y oppose, c'est la
 * demande elle-même qui ne veut rien dire.
 */
export class InvalidOrderTimeLimitScopeError extends DomainError {
  constructor(readonly scopeType: string) {
    super(
      "pim.order_time_limit.scope_invalid",
      "Une portée « toute la production » ne vise aucune cible ; toute autre portée doit en nommer une.",
    );
  }
}

/**
 * On pose une limite ailleurs que sur un **produit** ou une **famille**.
 *
 * « Toute la production » se règle au commerce (Réglages › Commandes › Heure
 * limite), et une déclinaison suit la limite de son produit.
 *
 * **400** : la demande vise une portée qui n'existe pas comme réglage. Le
 * message dit où se trouve le geste, parce que c'est lui qu'on cherchait.
 */
export class RetiredOrderTimeLimitScopeError extends DomainError {
  constructor(readonly scopeType: string) {
    super(
      "pim.order_time_limit.scope_retired",
      "Une limite de commande se pose sur un produit ou sur une famille. La limite pour toute la production se règle dans Réglages › Commandes › Heure limite, et une déclinaison suit celle de son produit.",
    );
  }
}

/**
 * La limite ne dit pas **le délai ET l'heure**.
 *
 * Une limite est une **règle entière** : il n'y a pas de rang au-dessus dont
 * hériter champ par champ, donc un délai sans heure (ou l'inverse) ne
 * refuserait rien tout en s'affichant comme une règle.
 */
export class IncompleteOrderTimeLimitError extends DomainError {
  constructor() {
    super(
      "pim.order_time_limit.incomplete",
      "Une limite de commande dit le délai et l'heure. Renseignez les deux, ou retirez la limite.",
    );
  }
}

/**
 * On pose un rattrapage sur une limite de produit.
 *
 * Décision de Hugo du 2026-10-21 (`schema-des-reglages.md` §4, point 2) : le
 * seul rattrapage est celui de la règle générale ; passé l'heure d'un produit,
 * la commande est refusée. Refusé plutôt qu'ignoré : l'ignorer ferait croire à
 * l'appelant qu'une grâce existe.
 */
export class ProductGraceRetiredError extends DomainError {
  constructor() {
    super(
      "pim.order_time_limit.grace_retired",
      "Une limite de produit n'a pas de rattrapage : passé l'heure, la commande est refusée. Le seul rattrapage est celui de Réglages › Commandes › Heure limite, et une dérogation s'y accorde.",
    );
  }
}

/** Aucune règle n'est posée sur cette portée. */
export class OrderTimeLimitNotFoundError extends ResourceNotFoundError {
  constructor(readonly id: string) {
    super("pim.order_time_limit.not_found", "Cette limite de commande n'existe pas.");
  }
}

/**
 * On exclut (ou réintègre) un produit d'une limite qui n'est pas celle d'une
 * famille. Une limite de produit vise un seul produit : l'en exclure n'a pas
 * de sens — on l'archive.
 *
 * **400** : la demande elle-même ne veut rien dire.
 */
export class ExclusionOnProductLimitError extends DomainError {
  constructor() {
    super(
      "pim.order_time_limit.exclusion_on_product",
      "Seule la limite d'une famille exclut des produits. Pour qu'un produit échappe à sa propre limite, archivez-la.",
    );
  }
}

/**
 * On exclut d'une limite de famille un produit qui n'est ni dans la famille ni
 * dans ses sous-familles : l'exclusion ne dirait rien, et l'écran mentirait en
 * la montrant.
 *
 * **409** : la demande a un sens, c'est le rangement du produit qui s'y oppose.
 */
export class ExclusionOutsideFamilyError extends BusinessError {
  constructor(
    readonly productId: string,
    readonly categoryId: string,
  ) {
    super(
      "pim.order_time_limit.exclusion_outside_family",
      "Ce produit n'est ni dans cette famille ni dans ses sous-familles : la limite de la famille ne le vise pas, il n'y a rien à exclure.",
    );
  }
}

/** On pose une limite sur une famille qui n'existe pas (`scope_id` n'a pas de clé étrangère). */
export class OrderTimeLimitFamilyNotFoundError extends ResourceNotFoundError {
  constructor(readonly categoryId: string) {
    super(
      "pim.order_time_limit.family_not_found",
      "Cette famille n'existe pas. Rechargez la page et choisissez une famille de la liste.",
    );
  }
}
