import {
  PromotionAudienceDuplicateCompanyError,
  PromotionAudienceSetEmptyError,
} from "./errors/promotion-audience-errors.js";
import { PromotionMissingTargetIdError } from "./errors/promotion-errors.js";
import {
  AUDIENCE_LABEL,
  PROMOTION_AUDIENCE_KINDS,
  audienceCompanyIdOf,
  type PromotionAudience,
  type PromotionAudienceKind,
} from "./promotion-audience.js";

/**
 * **Les feuilles de l'arbre des publics** (`documentation/promotions/promotions.md`, § 2.1 et § 2.16, lot L8b) — la partition de la clientèle : tout acheteur
 * tombe dans exactement une. Une société n'en est pas une : elle peut être
 * active ou en attente, elle est hors partition.
 */
export type PromotionAudienceLeaf =
  "individuals_guest" | "individuals_registered" | "pros_active" | "pros_pending";

type PartitionKind = Exclude<PromotionAudienceKind, "company" | "company_and_sites">;

/** La partition, écrite UNE fois : chaque public de clientèle, ses feuilles. */
const LEAVES_OF: Readonly<Record<PartitionKind, readonly PromotionAudienceLeaf[]>> = {
  everyone: ["individuals_guest", "individuals_registered", "pros_active", "pros_pending"],
  individuals: ["individuals_guest", "individuals_registered"],
  pros: ["pros_active", "pros_pending"],
  everyone_but_active_pros: ["individuals_guest", "individuals_registered", "pros_pending"],
  individuals_guest: ["individuals_guest"],
  individuals_registered: ["individuals_registered"],
  pros_active: ["pros_active"],
  pros_pending: ["pros_pending"],
};

/** Les groupes qu'on remonte au parent quand ils sont complets — du plus large au plus étroit. */
const GROUPS: readonly PartitionKind[] = ["everyone", "individuals", "pros"];

const INDIVIDUAL_LEAVES: readonly PromotionAudienceLeaf[] = LEAVES_OF.individuals;

/** L'audience d'un acheteur, au sens des libellés : particulier ou pro. */
export type LabelAudience = "individuals" | "pros";

/**
 * **Le public d'une promotion : un ensemble non vide de cibles, en forme
 * CANONIQUE.** Deux écritures du même public donnent la même valeur — c'est
 * ce qui rend sûres les comparaisons (chevauchement, contrôle, affichage).
 *
 * Immuable. Les cibles sont rangées dans l'ordre de `PROMOTION_AUDIENCE_KINDS`,
 * puis par société.
 */
export class PromotionAudienceSet {
  private constructor(readonly targets: readonly PromotionAudience[]) {}

  /**
   * **À l'écriture** (pose, révision) : la couverture en feuilles, remontée
   * au parent pour tout groupe complet ; `company(X)` avec
   * `company_and_sites(X)` ⇒ `company_and_sites(X)` ; une société reste à
   * côté d'un public de clientèle (son rang n'est pas le leur).
   * `everyone_but_active_pros` se déplie ici en {Particuliers, Pros en cours
   * d'inscription} : l'arbre de l'éditeur ne le connaît pas.
   *
   * @throws {PromotionAudienceSetEmptyError} aucune cible.
   * @throws {PromotionAudienceDuplicateCompanyError} la même société deux fois sous la même forme.
   * @throws {PromotionMissingTargetIdError} une société sans identifiant.
   */
  static of(targets: readonly PromotionAudience[]): PromotionAudienceSet {
    assertTargets(targets);
    const leaves = new Set(targets.flatMap(leavesOf));
    return new PromotionAudienceSet(sorted([...partitionOf(leaves), ...companiesOf(targets)]));
  }

  /**
   * **À la relecture** : la même forme canonique, à une exception — une
   * reprise qui porte `everyone_but_active_pros` seul le garde, tel que le
   * contrôle d'égalité de la bascule l'a comparé (§ 15.7).
   *
   * @throws les refus de {@link PromotionAudienceSet.of}.
   */
  static restore(targets: readonly PromotionAudience[]): PromotionAudienceSet {
    const [only] = targets;
    if (targets.length === 1 && only?.kind === "everyone_but_active_pros") {
      return new PromotionAudienceSet([only]);
    }
    return PromotionAudienceSet.of(targets);
  }

  /** Les feuilles de la partition que ce public couvre. */
  get leaves(): ReadonlySet<PromotionAudienceLeaf> {
    return new Set(this.targets.flatMap(leavesOf));
  }

  /** Les cibles « société » de ce public. */
  get companies(): readonly PromotionAudience[] {
    return this.targets.filter((target) => audienceCompanyIdOf(target) !== null);
  }

  /** Ce public touche-t-il cette audience ? Une société est sous la branche Pros (§ 9). */
  touches(audience: LabelAudience): boolean {
    const leaves = [...this.leaves];
    return audience === "individuals"
      ? leaves.some((leaf) => INDIVIDUAL_LEAVES.includes(leaf))
      : leaves.some((leaf) => !INDIVIDUAL_LEAVES.includes(leaf)) || this.companies.length > 0;
  }

  /**
   * **Le public que deux promotions se disputent**, nommé pour un refus
   * (« les pros actifs », « la société X »), ou
   * `null` : une feuille commune, ou une même société (une société et ses
   * sites croise toute société, dont l'un des sites peut être l'autre).
   */
  crossing(other: PromotionAudienceSet): string | null {
    const theirs = other.leaves;
    const common = new Set([...this.leaves].filter((leaf) => theirs.has(leaf)));
    if (common.size > 0) {
      // Le public commun le plus large : « tout le monde », « les pros »…
      return partitionOf(common)
        .map((target) =>
          target.kind === "everyone" ? "tout le monde" : `les ${AUDIENCE_LABEL[target.kind]}`,
        )
        .join(" et ");
    }
    for (const mine of this.companies) {
      const crossed = other.companies.find((their) => companiesCross(mine, their));
      if (crossed !== undefined) {
        const named = audienceCompanyIdOf(mine.kind === "company" ? mine : crossed);
        return `la société ${named ?? ""}`.trim();
      }
    }
    return null;
  }
}

function assertTargets(targets: readonly PromotionAudience[]): void {
  if (targets.length === 0) {
    throw new PromotionAudienceSetEmptyError();
  }
  const seen = new Set<string>();
  for (const target of targets) {
    const companyId = audienceCompanyIdOf(target);
    if (companyId === null) {
      continue;
    }
    if (companyId.trim() === "") {
      throw new PromotionMissingTargetIdError("company");
    }
    const key = `${target.kind}:${companyId}`;
    if (seen.has(key)) {
      throw new PromotionAudienceDuplicateCompanyError(companyId);
    }
    seen.add(key);
  }
}

function leavesOf(target: PromotionAudience): readonly PromotionAudienceLeaf[] {
  return target.kind === "company" || target.kind === "company_and_sites"
    ? []
    : LEAVES_OF[target.kind];
}

/** La couverture en feuilles, remontée au plus large groupe complet. */
function partitionOf(leaves: ReadonlySet<PromotionAudienceLeaf>): PromotionAudience[] {
  const rest = new Set(leaves);
  const kept: PromotionAudience[] = [];
  for (const group of GROUPS) {
    const members = LEAVES_OF[group];
    if (members.every((leaf) => rest.has(leaf))) {
      kept.push({ kind: group });
      members.forEach((leaf) => rest.delete(leaf));
    }
  }
  return [...kept, ...[...rest].map((leaf): PromotionAudience => ({ kind: leaf }))];
}

/** Les sociétés, `company(X)` absorbée par `company_and_sites(X)`. */
function companiesOf(targets: readonly PromotionAudience[]): PromotionAudience[] {
  const withSites = new Set(
    targets.filter((target) => target.kind === "company_and_sites").map(audienceCompanyIdOf),
  );
  return targets.filter(
    (target) =>
      target.kind === "company_and_sites" ||
      (target.kind === "company" && !withSites.has(target.companyId)),
  );
}

function companiesCross(left: PromotionAudience, right: PromotionAudience): boolean {
  if (left.kind === "company_and_sites" || right.kind === "company_and_sites") {
    return true;
  }
  return audienceCompanyIdOf(left) === audienceCompanyIdOf(right);
}

function sorted(targets: readonly PromotionAudience[]): PromotionAudience[] {
  const order = (target: PromotionAudience) => PROMOTION_AUDIENCE_KINDS.indexOf(target.kind);
  return [...targets].sort(
    (left, right) =>
      order(left) - order(right) ||
      (audienceCompanyIdOf(left) ?? "").localeCompare(audienceCompanyIdOf(right) ?? ""),
  );
}
