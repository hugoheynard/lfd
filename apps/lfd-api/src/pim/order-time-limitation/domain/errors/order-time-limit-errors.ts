import {
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
 * On pose une limite ailleurs que sur un **produit**.
 *
 * Décision de Hugo du 2026-10-21 (`limites-de-commande/schema-des-reglages.md`
 * §4) : le référentiel n'a plus qu'une limite par produit. « Toute la
 * production » se règle au commerce (Réglages › Commandes › Heure limite), une
 * famille n'a plus de limite propre, et une déclinaison suit son produit.
 *
 * **400** : la demande vise une portée qui n'existe plus comme réglage. Le
 * message dit où se trouve le geste, parce que c'est lui qu'on cherchait.
 */
export class RetiredOrderTimeLimitScopeError extends DomainError {
  constructor(readonly scopeType: string) {
    super(
      "pim.order_time_limit.scope_retired",
      "Une limite de commande ne se pose plus que sur un produit. La limite pour toute la production se règle dans Réglages › Commandes › Heure limite ; une famille n'a plus de limite propre, et une déclinaison suit celle de son produit.",
    );
  }
}

/**
 * La limite d'un produit ne dit pas **le délai ET l'heure**.
 *
 * Depuis le 2026-10-21, une limite de produit est une **règle entière** : il
 * n'y a plus de rang au-dessus dont hériter, donc un délai sans heure (ou
 * l'inverse) ne refuserait rien tout en s'affichant comme une règle.
 */
export class IncompleteOrderTimeLimitError extends DomainError {
  constructor() {
    super(
      "pim.order_time_limit.incomplete",
      "Une limite de produit dit le délai et l'heure. Renseignez les deux, ou retirez la limite.",
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
