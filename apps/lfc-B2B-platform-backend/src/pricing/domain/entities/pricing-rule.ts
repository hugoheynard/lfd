import {
  ArchivedPriceRuleIsSealedError,
  ClosedPriceRuleWindowError,
  InvalidAlterationError,
  MercurialeMustPoseAPriceError,
  PriceRuleAlreadyPausedError,
  PriceRuleNotPausedError,
  ScopeIdMismatchError,
  ReversedValidityWindowError,
} from "../pricing-errors.js";
import { IN_FORCE, statusOf, suspendedFromOf } from "../rule-lifecycle.js";
import type { RuleLifecycle, RuleStatus } from "../rule-lifecycle.js";
import type {
  AuthoredPriceStage,
  PriceAlteration,
  PriceAudience,
  PriceRule,
  PriceScope,
  PriceStage,
} from "../price-rule.js";

/** Ce qu'un appelant apporte pour créer une règle — l'intention, pas l'état. */
export interface PricingRuleDraft {
  /** L'étage **saisissable** : le volume se pose en barème, pas en règle. */
  readonly stage: AuthoredPriceStage;
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

/**
 * L'état persisté — ce que l'adaptateur écrit, et rien d'autre.
 *
 * Son `stage` est plus large que celui du brouillon, **volontairement** : les
 * règles volume d'avant le barème existent en base, archivées, et une facture les
 * cite. Un état qui refuserait de les relire rendrait illisible l'histoire qu'on
 * a justement décidé de ne jamais effacer.
 */
export interface PricingRuleState extends Omit<PricingRuleDraft, "stage"> {
  readonly stage: PriceStage;
  readonly id: string;
  readonly createdBy: string;
  readonly lifecycle: RuleLifecycle;
}

/**
 * **La règle tarifaire, en tant qu'agrégat.**
 *
 * Deux familles d'invariants y vivent, et aucune n'aurait tenu ailleurs.
 *
 * Les premiers refusent une règle **mal formée** — une mercuriale en
 * pourcentage, une portée qui se contredit, une fenêtre inversée, une altération
 * négative. Les laisser au contrôleur ou au schéma zod les aurait dispersés sur
 * trois fichiers dont un seul est éprouvable sans base.
 *
 * Les seconds gouvernent son **cycle de vie** : suspendre, reprendre, archiver.
 * Ce ne sont pas des écritures de champs, ce sont des transitions — et chacune a
 * un état de départ qu'elle refuse. Écrites ici, elles valent aussi pour
 * l'import, le seed et le planificateur des paniers récurrents ; écrites dans le
 * handler, elles n'auraient valu que pour la route.
 *
 * Les transitions rendent une **nouvelle** instance plutôt que de muter
 * celle-ci : l'appelant tient alors l'avant et l'après, ce dont le journal a
 * besoin pour dire ce qui a changé.
 *
 * `create` est le **seul** constructeur public. Un `new PricingRule(state)`
 * exposé aurait permis d'écrire en base une règle qu'aucun de ces refus n'a
 * traversée.
 *
 * Un troisième invariant ne s'écrit **pas** ici, et c'est délibéré : l'étage
 * `volume` n'est pas refusé, il est **inexprimable** — le brouillon ne l'accepte
 * pas dans son type. Le volume appartient au barème, et un refus à l'exécution
 * aurait laissé le code appelant compiler puis échouer ; le type le fait échouer
 * avant d'exister. Le fil, lui, est fermé par `authoredPriceStageSchema`.
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
    // à CHAQUE étage : « pendant l'opération, cet article est à 1,80 € » et
    // « cet article offert » sont des décisions commerciales réelles, et rien ne
    // se casse à les autoriser. Un invariant sans raison finit par être
    // contourné plutôt que compris.
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

    return new PricingRule({ ...draft, id, createdBy, lifecycle: IN_FORCE });
  }

  /** Reconstruit sans revérifier : ce qui est en base y est déjà passé. */
  static reconstitute(state: PricingRuleState): PricingRule {
    return new PricingRule(state);
  }

  get id(): string {
    return this.state.id;
  }

  get status(): RuleStatus {
    return statusOf(this.state.lifecycle);
  }

  /** Ce que l'écran montre d'un coup d'œil : le libellé de la décision. */
  get label(): string {
    return this.state.label;
  }

  /**
   * **Suspendre.** La règle cesse d'agir et **garde sa place**.
   *
   * La fenêtre n'est pas touchée, et c'est la décision qui compte ici : une
   * promotion « du 1er au 31 août » suspendue trois jours ne se prolonge pas
   * jusqu'au 3 septembre. Elle a perdu trois jours, ce qui est exactement ce qui
   * s'est passé. Repousser la fin en douce serait réécrire une décision
   * commerciale pour compenser un incident d'exploitation — et personne, en
   * relisant la règle, ne saurait plus quelle était l'intention d'origine.
   *
   * @throws {ArchivedPriceRuleIsSealedError} la règle est archivée.
   * @throws {PriceRuleAlreadyPausedError} quelqu'un l'a déjà suspendue.
   * @throws {ClosedPriceRuleWindowError} sa fenêtre est close : le geste
   *   n'aurait que l'apparence d'un effet.
   */
  pause(by: string, at: Date): PricingRule {
    this.assertOpenFor(at);
    if (this.state.lifecycle.pausedAt !== null) {
      throw new PriceRuleAlreadyPausedError(this.state.id, this.state.lifecycle.pausedAt);
    }
    return this.withLifecycle({ pausedAt: at, pausedBy: by });
  }

  /**
   * **Reprendre.** La règle réagit, à partir de maintenant.
   *
   * @throws {ArchivedPriceRuleIsSealedError} la règle est archivée.
   * @throws {PriceRuleNotPausedError} elle n'était pas suspendue.
   * @throws {ClosedPriceRuleWindowError} sa fenêtre est close entre-temps : la
   *   reprise ne rallumerait rien, et le dire vaut mieux que de l'afficher.
   */
  resume(at: Date): PricingRule {
    this.assertOpenFor(at);
    if (this.state.lifecycle.pausedAt === null) {
      throw new PriceRuleNotPausedError(this.state.id);
    }
    return this.withLifecycle({ pausedAt: null, pausedBy: null });
  }

  /**
   * **Archiver.** Terminal : la règle cesse d'agir et **rend sa place**.
   *
   * Aucune vérification de fenêtre ici, à la différence de la pause : archiver
   * une règle terminée est le cas le plus courant de tous — c'est le rangement.
   *
   * Une règle en pause s'archive aussi : la pause n'est pas un état protégé,
   * c'est une suspension.
   *
   * @throws {ArchivedPriceRuleIsSealedError} elle l'est déjà.
   */
  archive(by: string, at: Date, reason: string | null): PricingRule {
    this.assertNotArchived();
    return this.withLifecycle({ archivedAt: at, archivedBy: by, archiveReason: reason });
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
      suspendedFrom: suspendedFromOf(this.state.lifecycle),
      label: this.state.label,
    };
    return this.state.effect.nature === "replace"
      ? { ...common, nature: "replace", amountCents: this.state.effect.amountCents }
      : { ...common, nature: "alter", alteration: this.state.effect.alteration };
  }

  toPersistence(): PricingRuleState {
    return this.state;
  }

  private withLifecycle(change: Partial<RuleLifecycle>): PricingRule {
    return new PricingRule({
      ...this.state,
      lifecycle: { ...this.state.lifecycle, ...change },
    });
  }

  private assertNotArchived(): void {
    if (this.state.lifecycle.archivedAt !== null) {
      throw new ArchivedPriceRuleIsSealedError(this.state.id);
    }
  }

  /** Ni scellée, ni déjà terminée : les deux refus que partagent pause et reprise. */
  private assertOpenFor(at: Date): void {
    this.assertNotArchived();
    const { validTo } = this.state;
    if (validTo !== null && validTo.getTime() <= at.getTime()) {
      throw new ClosedPriceRuleWindowError(this.state.id, validTo);
    }
  }
}

/** `id` est renseigné **si et seulement si** la portée n'est pas la plus large. */
function assertScopedId(axis: string, isWidest: boolean, id: string | null): void {
  if (isWidest === (id === null)) {
    return;
  }
  throw new ScopeIdMismatchError(axis, isWidest, id);
}
