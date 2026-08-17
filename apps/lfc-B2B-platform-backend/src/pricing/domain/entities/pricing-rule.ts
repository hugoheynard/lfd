import {
  InvalidAlterationError,
  MercurialeMustPoseAPriceError,
  ScopeIdMismatchError,
  ReversedValidityWindowError,
} from "../pricing-errors.js";
import type {
  PriceAlteration,
  PriceAudience,
  PriceRule,
  PriceScope,
  PriceStage,
} from "../price-rule.js";

/** Ce qu'un appelant apporte pour créer une règle — l'intention, pas l'état. */
export interface PricingRuleDraft {
  readonly stage: PriceStage;
  readonly scope: PriceScope;
  readonly audience: PriceAudience;
  readonly minQuantity: number | null;
  readonly effect:
    | { readonly nature: "replace"; readonly amountCents: number }
    | { readonly nature: "alter"; readonly alteration: PriceAlteration };
  readonly label: string;
  readonly validFrom: Date;
  readonly validTo: Date | null;
}

/** L'état persisté — ce que l'adaptateur écrit, et rien d'autre. */
export interface PricingRuleState extends PricingRuleDraft {
  readonly id: string;
  readonly createdBy: string;
}

/**
 * **La règle tarifaire, en tant qu'agrégat.**
 *
 * Elle n'a pas de cycle de vie : on la pose, on la retire. La question qui
 * décide n'est pourtant pas « y a-t-il des transitions ? » mais **« existe-t-il
 * une règle qui peut refuser cette écriture ? »** — et il y en a quatre. Les
 * laisser au contrôleur ou au schéma zod les aurait dispersées sur trois
 * fichiers dont un seul est testé sans base.
 *
 * `create` est le **seul** constructeur public. Un `new PricingRule(state)`
 * exposé aurait permis d'écrire en base une règle qu'aucun de ces refus n'a
 * traversée — par un import, un seed, une migration.
 */
export class PricingRule {
  private constructor(private readonly state: PricingRuleState) {}

  /**
   * @throws {MercurialeMustPoseAPriceError} une mercuriale exprimée en
   *   pourcentage — le piège central du modèle.
   * @throws {ScopeIdMismatchError} portée ou audience dont l'identifiant
   *   contredit le type.
   * @throws {ReversedValidityWindowError} fenêtre qui se ferme avant de s'ouvrir.
   * @throws {InvalidAlterationError} grandeur d'altération nulle ou négative.
   */
  static create(id: string, draft: PricingRuleDraft, createdBy: string): PricingRule {
    // **Le refus qui compte.** Une mercuriale saisie en « −13 % » SUIT le tarif
    // de liste : le jour où le PIM augmente, le prix négocié augmente avec lui,
    // et ce n'est pas ce qu'on a promis au client. Un tarif négocié est un
    // engagement en euros, il se stocke en euros.
    //
    // Volontairement plus étroit que le tableau du doc, qui assigne une nature
    // à CHAQUE étage : « 100+ à 1,80 € fixe » et « cet article offert » sont des
    // gestes commerciaux réels, et rien ne se casse à les autoriser. Un
    // invariant sans raison finit par être contourné plutôt que compris.
    if (draft.stage === "mercuriale" && draft.effect.nature !== "replace") {
      throw new MercurialeMustPoseAPriceError();
    }

    assertScopedId("portée", draft.scope.type === "global", draft.scope.id);
    assertScopedId("audience", draft.audience.type === "all", draft.audience.id);

    if (draft.validTo !== null && draft.validTo.getTime() <= draft.validFrom.getTime()) {
      throw new ReversedValidityWindowError(draft.validFrom, draft.validTo);
    }

    if (draft.effect.nature === "alter") {
      const { alteration } = draft.effect;
      const magnitude = alteration.mode === "percent" ? alteration.bp : alteration.cents;
      if (!Number.isInteger(magnitude) || magnitude <= 0) {
        throw new InvalidAlterationError(magnitude);
      }
    }

    return new PricingRule({ ...draft, id, createdBy });
  }

  /** Reconstruit sans revérifier : ce qui est en base y est déjà passé. */
  static reconstitute(state: PricingRuleState): PricingRule {
    return new PricingRule(state);
  }

  get id(): string {
    return this.state.id;
  }

  /** La forme que lit la résolution — celle du calcul, pas celle du stockage. */
  get asPriceRule(): PriceRule {
    const common = {
      id: this.state.id,
      stage: this.state.stage,
      scope: this.state.scope,
      audience: this.state.audience,
      minQuantity: this.state.minQuantity,
      validFrom: this.state.validFrom,
      validTo: this.state.validTo,
      label: this.state.label,
    };
    return this.state.effect.nature === "replace"
      ? { ...common, nature: "replace", amountCents: this.state.effect.amountCents }
      : { ...common, nature: "alter", alteration: this.state.effect.alteration };
  }

  toPersistence(): PricingRuleState {
    return this.state;
  }
}

/** `id` est renseigné **si et seulement si** la portée n'est pas la plus large. */
function assertScopedId(axis: string, isWidest: boolean, id: string | null): void {
  if (isWidest === (id === null)) {
    return;
  }
  throw new ScopeIdMismatchError(axis, isWidest, id);
}
