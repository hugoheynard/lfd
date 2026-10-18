import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus des **suggestions décidées par le staff**
 * (`documentation/recommandation-produit/plan-suggestions-du-staff.md`, §2).
 *
 * Chaque message est lu par du personnel qui n'a pas le code sous les yeux :
 * il nomme le cas réel et le geste de sortie. Les jours y sont dits
 * `JJ/MM/AAAA`, jamais en ISO.
 */

/** Un déclencheur que la règle ne connaît pas. 400. */
export class UnknownSuggestionTriggerError extends DomainError {
  constructor(kind: string) {
    super(
      "suggestions.trigger_unknown",
      `Le déclencheur « ${kind} » n'existe pas : choisir « partout », « article au panier », « famille au panier » ou « fiche d'article ouverte ».`,
    );
  }
}

/** Un déclencheur qui doit nommer un article ou une famille, et n'en nomme pas — ou l'inverse. 400. */
export class SuggestionTriggerRefError extends DomainError {
  constructor(kind: string, expectsRef: boolean) {
    super(
      "suggestions.trigger_ref",
      expectsRef
        ? `Le déclencheur « ${wordOf(TRIGGER_WORDS, kind)} » nomme un article ou une famille : le choisir dans le catalogue.`
        : "Le déclencheur « partout » ne nomme ni article ni famille : retirer l'article choisi, ou changer de déclencheur.",
    );
  }
}

/** Un emplacement que la règle ne connaît pas. 400. */
export class UnknownSuggestionPlacementError extends DomainError {
  constructor(placement: string) {
    super(
      "suggestions.placement_unknown",
      `L'emplacement « ${placement} » n'existe pas : choisir le panier, la fiche d'article ou l'accueil.`,
    );
  }
}

/**
 * Un emplacement où le déclencheur ne peut pas être vrai : une fiche ouverte
 * ne déclenche qu'en fiche, un panier qu'au panier. 400.
 */
export class SuggestionPlacementMismatchError extends DomainError {
  constructor(kind: string, placement: string, allowed: readonly string[]) {
    super(
      "suggestions.placement_mismatch",
      `Le déclencheur « ${wordOf(TRIGGER_WORDS, kind)} » ne peut pas être vrai à l'emplacement « ${wordOf(PLACEMENT_WORDS, placement)} » : choisir ${allowed.map((value) => `« ${wordOf(PLACEMENT_WORDS, value)} »`).join(" ou ")}.`,
    );
  }
}

/** Une audience que la règle ne connaît pas. 400. */
export class UnknownSuggestionAudienceError extends DomainError {
  constructor(audience: string) {
    super(
      "suggestions.audience_unknown",
      `L'audience « ${audience} » n'existe pas : choisir les professionnels, les particuliers, ou les deux.`,
    );
  }
}

/** Aucun article suggéré, ou trop. 400. */
export class SuggestedCountError extends DomainError {
  constructor(count: number, max: number) {
    super(
      "suggestions.suggested_count",
      count === 0
        ? `Une suggestion montre au moins un article : en choisir un, ${max} au plus.`
        : `Une suggestion montre ${max} articles au plus, et celle-ci en porte ${count} : en retirer.`,
    );
  }
}

/** Le même article suggéré deux fois. 400. */
export class DuplicateSuggestedSkuError extends DomainError {
  constructor(sku: string) {
    super(
      "suggestions.suggested_duplicate",
      `L'article ${sku} est suggéré deux fois : le garder une seule fois.`,
    );
  }
}

/** Un article suggéré qui est celui qui déclenche. 400. */
export class SuggestedEqualsTriggerError extends DomainError {
  constructor(sku: string) {
    super(
      "suggestions.suggested_is_trigger",
      `L'article ${sku} déclenche la suggestion : il ne peut pas aussi être suggéré. Le retirer des articles montrés.`,
    );
  }
}

/** Un jour qui n'est pas un jour du calendrier. 400. */
export class InvalidSuggestionDayError extends DomainError {
  constructor(field: string, raw: string) {
    super(
      "suggestions.day_invalid",
      `${field} « ${raw} » n'est pas un jour du calendrier (format AAAA-MM-JJ) : le choisir dans le calendrier.`,
    );
  }
}

/** Une période à l'envers. 400. */
export class SuggestionPeriodReversedError extends DomainError {
  constructor(startsOn: string, endsOn: string) {
    super(
      "suggestions.period_reversed",
      `La suggestion finit le ${french(endsOn)}, avant de commencer le ${french(startsOn)} : avancer le début ou repousser la fin.`,
    );
  }
}

/** Une règle créée déjà finie. 400. */
export class SuggestionPeriodOverError extends DomainError {
  constructor(endsOn: string, today: string) {
    super(
      "suggestions.period_over",
      `La suggestion finirait le ${french(endsOn)}, déjà passé (nous sommes le ${french(today)}) : repousser la fin.`,
    );
  }
}

/** Une phrase sans français, ou trop longue. 400. */
export class InvalidSuggestionPhraseError extends DomainError {
  constructor(reason: "missing_fr" | "too_long", language: string, max: number) {
    super(
      "suggestions.phrase_invalid",
      reason === "missing_fr"
        ? "La phrase de la suggestion s'écrit d'abord en français : l'écrire, ou laisser la phrase vide pour « Notre conseil »."
        : `La phrase en ${language} dépasse ${max} caractères : la raccourcir, elle s'affiche sur une ligne.`,
    );
  }
}

/** Une priorité hors de la borne. 400. */
export class InvalidSuggestionPriorityError extends DomainError {
  constructor(priority: number, max: number) {
    super(
      "suggestions.priority_invalid",
      `La priorité ${priority} n'est pas admise : un nombre entier de 0 à ${max}, le plus haut passant d'abord.`,
    );
  }
}

/** Un ordre que le réglage ne connaît pas. 400. */
export class UnknownSuggestionOrderError extends DomainError {
  constructor(order: string) {
    super(
      "suggestions.order_unknown",
      `L'ordre « ${order} » n'existe pas : choisir « la plus récente d'abord » ou « par priorité ».`,
    );
  }
}

/** Un article ou une famille que le catalogue ne sert à personne. 400. */
export class UnknownSuggestionCatalogueError extends DomainError {
  constructor(what: "articles" | "familles", refs: readonly string[]) {
    super(
      "suggestions.catalogue_unknown",
      `${what === "articles" ? "Article(s)" : "Famille(s)"} inconnu(s) du catalogue servi : ${refs.join(", ")}. Choisir dans la liste — un article masqué ou retiré ne se suggère pas.`,
    );
  }
}

/** Une règle archivée qu'on voudrait encore écrire. 409. */
export class SuggestionRuleArchivedError extends BusinessError {
  constructor(id: string) {
    super(
      "suggestions.archived",
      `La suggestion ${id} est archivée : elle ne se modifie plus. En créer une nouvelle.`,
    );
  }
}

/** Aucune règle sous cet id. 404. */
export class SuggestionRuleNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super("suggestions.not_found", `Aucune suggestion ne porte l'identifiant ${id}.`);
  }
}

/** Les mots de l'écran, pour qu'un refus ne cite jamais une valeur de contrat. */
const TRIGGER_WORDS: Readonly<Record<string, string>> = {
  everywhere: "partout",
  product_in_cart: "article au panier",
  category_in_cart: "famille au panier",
  product_viewed: "fiche d'article ouverte",
};
const PLACEMENT_WORDS: Readonly<Record<string, string>> = {
  cart: "panier",
  product: "fiche d'article",
  home: "accueil",
};

function wordOf(words: Readonly<Record<string, string>>, value: string): string {
  return words[value] ?? value;
}

/** `AAAA-MM-JJ` → `JJ/MM/AAAA`. */
function french(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date ?? ""}/${month ?? ""}/${year ?? ""}`;
}
