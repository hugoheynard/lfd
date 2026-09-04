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
 * Les trois valeurs sont absentes : la règle ne dit rien.
 *
 * Refusée plutôt qu'écrite, et ce n'est pas de la coquetterie. Une ligne muette
 * se lirait, à l'écran comme au débogage, comme « une règle existe ici » — alors
 * qu'elle laisserait tout hériter du rang du dessus. Pour dire « ce rang ne se
 * prononce pas », on supprime la ligne ; c'est le même geste, et il est lisible.
 */
export class EmptyOrderTimeLimitError extends DomainError {
  constructor() {
    super(
      "pim.order_time_limit.empty",
      "Renseignez au moins un des trois réglages, ou supprimez la règle.",
    );
  }
}

/** Aucune règle n'est posée sur cette portée. */
export class OrderTimeLimitNotFoundError extends ResourceNotFoundError {
  constructor(readonly id: string) {
    super("pim.order_time_limit.not_found", "Cette limite de commande n'existe pas.");
  }
}
