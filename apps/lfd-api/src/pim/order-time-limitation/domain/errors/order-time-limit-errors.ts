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

/**
 * On retire le rang **global** alors que des rangs inférieurs en dépendent.
 *
 * L'héritage se fait **champ par champ** : une famille qui ne pose que l'heure
 * emprunte son délai au global, et `resolveOrderTimeLimit` rend `null` dès qu'un
 * des deux manque. Retirer le global ne rendrait donc pas ces règles « plus
 * permissives » — il les rendrait **muettes**, sans rien changer à l'écran qui
 * les affiche encore.
 *
 * **409 et non 400** : la demande est bien formée, c'est l'état du monde qui s'y
 * oppose. Elle redeviendra légitime dès que les règles nommées auront leur délai
 * et leur heure, ou qu'elles auront été retirées.
 *
 * 🔴 Ce refus est ce qui remplace une consigne. Depuis que la garde du commerce
 * s'efface derrière l'échelle, le rang global est la seule chose qui fasse
 * refuser une commande en retard pour un article dont personne n'a parlé — et
 * un `DELETE` sans garde suffisait à ouvrir la plateforme entière, en silence.
 */
export class GlobalOrderTimeLimitStillNeededError extends BusinessError {
  constructor(readonly dependents: readonly string[]) {
    super(
      "pim.order_time_limit.global_still_needed",
      `${listOf(dependents)} ${dependents.length > 1 ? "n'ont" : "n'a"} pas de délai ou pas d'heure : sans le rang global, ${dependents.length > 1 ? "elles ne refuseraient" : "elle ne refuserait"} plus rien. Complétez ${dependents.length > 1 ? "ces règles" : "cette règle"}, ou retirez-${dependents.length > 1 ? "les" : "la"} d'abord.`,
    );
  }
}

/**
 * Les dépendants, nommés — pas comptés.
 *
 * Le message est lu par du personnel qui n'a pas le code sous les yeux : « 3
 * règles dépendent du global » oblige à les chercher une par une. Au-delà de
 * trois, on cite les trois premières et on compte le reste : une liste de vingt
 * noms ne se lit pas dans un toast.
 */
function listOf(dependents: readonly string[]): string {
  const shown = dependents.slice(0, 3).map((name) => `« ${name} »`);
  const rest = dependents.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} et ${String(rest)} autre(s)` : shown.join(", ");
}
