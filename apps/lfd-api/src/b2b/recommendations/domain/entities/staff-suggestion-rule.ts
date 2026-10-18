import {
  SuggestedEqualsTriggerError,
  SuggestionPeriodOverError,
  SuggestionRuleArchivedError,
} from "../errors/staff-suggestion-errors.js";
import { SuggestionFamilyContradictionError } from "../errors/suggestion-condition-errors.js";
import { suggestionAudience } from "../value-objects/suggestion-audience.js";
import { suggestionConditions } from "../value-objects/suggestion-conditions.js";
import { suggestionPeriod } from "../value-objects/suggestion-period.js";
import { suggestionPhrase } from "../value-objects/suggestion-phrase.js";
import { suggestionPriority } from "../value-objects/suggestion-priority.js";
import {
  suggestionPlacement,
  suggestionTrigger,
  triggerSku,
} from "../value-objects/suggestion-trigger.js";
import { suggestedSkus } from "../value-objects/suggested-skus.js";
import type {
  StaffSuggestionRuleBody,
  StaffSuggestionRuleInput,
  StaffSuggestionRuleRecord,
  StaffSuggestionRuleSnapshot,
  WriteStamp,
} from "./staff-suggestion-rule-shapes.js";

export type {
  StaffSuggestionRuleBody,
  StaffSuggestionRuleInput,
  StaffSuggestionRuleRecord,
  StaffSuggestionRuleSnapshot,
  WriteStamp,
} from "./staff-suggestion-rule-shapes.js";

/** L'état qui change d'un geste à l'autre — tout sauf l'identité et la naissance. */
interface RuleState {
  body: StaffSuggestionRuleBody;
  active: boolean;
  lastWrite: WriteStamp;
  archivedAt: Date | null;
}

/**
 * **Une suggestion décidée par le staff** — « quand le client fait ceci,
 * montre-lui cela » (`documentation/recommandation-produit/suggestions-du-staff.md`, §2).
 *
 * Elle tient ce qu'une règle peut refuser seule : un déclencheur qui nomme ce
 * qu'il doit nommer, un emplacement où il peut être vrai, 1 à 3 articles
 * distincts dont aucun n'est celui qui déclenche, une période dans l'ordre,
 * une phrase française bornée, une priorité entière, des conditions
 * facultatives cohérentes (RS8). Qu'un article ou une
 * famille EXISTE dépend du catalogue : c'est aux cas d'usage de le demander.
 *
 * Une règle naît allumée. Elle se coupe et se rallume (`setActive`), se
 * réécrit, et s'archive — jamais ne se supprime. Archivée, elle ne s'écrit
 * plus.
 */
export class StaffSuggestionRule {
  private constructor(
    readonly id: string,
    private readonly created: WriteStamp,
    private state: RuleState,
  ) {}

  /**
   * Déclare une règle. `today` est le jour métier du geste (Paris, lu au
   * `Clock`) : une règle déjà finie à sa création ne servirait jamais.
   *
   * @throws {SuggestionPeriodOverError} sa fin est déjà passée.
   */
  static declare(
    id: string,
    input: StaffSuggestionRuleInput,
    stamp: WriteStamp,
    today: string,
  ): StaffSuggestionRule {
    const body = bodyOf(input);
    if (body.period.endsOn < today) {
      throw new SuggestionPeriodOverError(body.period.endsOn, today);
    }
    return new StaffSuggestionRule(id, stamp, {
      body,
      active: true,
      lastWrite: stamp,
      archivedAt: null,
    });
  }

  /** Rehydrate depuis la base. Les invariants se rejugent — une ligne écrite à la main aussi. */
  static reconstitute(record: StaffSuggestionRuleRecord): StaffSuggestionRule {
    return new StaffSuggestionRule(record.id, record.created, {
      body: bodyOf(record),
      active: record.active,
      lastWrite: record.lastWrite,
      archivedAt: record.archivedAt,
    });
  }

  /**
   * Réécrit la règle entière. Une période déjà passée reste permise : on
   * corrige une règle finie pour la relire juste, pas pour la relancer.
   *
   * @throws {SuggestionRuleArchivedError}
   */
  revise(input: StaffSuggestionRuleInput, stamp: WriteStamp): void {
    this.ensureLive();
    this.state = { ...this.state, body: bodyOf(input), lastWrite: stamp };
  }

  /**
   * Coupe ou rallume, sans rien supprimer.
   *
   * @returns `false` si elle l'était déjà — rien n'a changé, rien à écrire.
   * @throws {SuggestionRuleArchivedError}
   */
  setActive(active: boolean, stamp: WriteStamp): boolean {
    this.ensureLive();
    if (this.state.active === active) {
      return false;
    }
    this.state = { ...this.state, active, lastWrite: stamp };
    return true;
  }

  /**
   * Archive : retirée pour toujours. L'instant du geste devient la date du retrait.
   *
   * @throws {SuggestionRuleArchivedError} elle l'est déjà — un second archivage
   * écraserait la date du premier, qui est celle qu'on cherchera.
   */
  archive(stamp: WriteStamp): void {
    this.ensureLive();
    this.state = { ...this.state, archivedAt: stamp.at, lastWrite: stamp };
  }

  /** L'emplacement d'un compteur d'audience `staff` de cette règle : son id en minuscules (`suggestions-du-staff.md` §8.1). */
  get audienceKey(): string {
    return this.id.toLowerCase();
  }

  snapshot(): StaffSuggestionRuleSnapshot {
    const { body, ...rest } = this.state;
    return { id: this.id, created: this.created, ...body, ...rest };
  }

  private ensureLive(): void {
    if (this.state.archivedAt !== null) {
      throw new SuggestionRuleArchivedError(this.id);
    }
  }
}

/**
 * Juge une règle entière.
 *
 * @throws {SuggestedEqualsTriggerError} un article montré est celui qui déclenche.
 * @throws {SuggestionFamilyContradictionError} « famille au panier » et « sans
 * cette famille » sur la même : la règle ne serait jamais vraie.
 */
function bodyOf(input: StaffSuggestionRuleInput): StaffSuggestionRuleBody {
  const trigger = suggestionTrigger(input.trigger);
  const placement = suggestionPlacement(trigger, input.placement);
  const skus = suggestedSkus(input.suggestedSkus);
  const triggering = triggerSku(trigger);
  if (triggering !== null && skus.includes(triggering)) {
    throw new SuggestedEqualsTriggerError(triggering);
  }
  const conditions = suggestionConditions(input.conditions, placement);
  if (trigger.kind === "category_in_cart" && trigger.ref === conditions.cartWithoutFamilyId) {
    throw new SuggestionFamilyContradictionError(trigger.ref ?? "");
  }
  return {
    trigger,
    suggestedSkus: skus,
    placement,
    audience: suggestionAudience(input.audience),
    period: suggestionPeriod(input.startsOn, input.endsOn),
    phrase: suggestionPhrase(input.phrase),
    priority: suggestionPriority(input.priority),
    conditions,
  };
}
