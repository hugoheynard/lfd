import { OptionGroupArchivedError } from "../../../../reference/product-options/domain/errors/option-group-errors.js";
import { refuseEditOfArchived } from "../errors/archived-product-edit-errors.js";
import { VariantNotFoundError } from "../errors/product-errors.js";
import { EmptyOptionVariantListError } from "../errors/product-option-errors.js";

/** Un groupe sur la fiche : pour toutes ses déclinaisons, ou une liste. */
export interface OptionActivationSnapshot {
  readonly groupId: string;
  /** `true` = toutes les déclinaisons, celles qui viendront comprises ; `variantIds` est vide. */
  readonly allVariants: boolean;
  /** Triés ; vides quand `allVariants`. */
  readonly variantIds: readonly string[];
  /** `null` = actif. */
  readonly revokedAt: Date | null;
}

/** Ce que l'activation sait de la fiche : son état et ses déclinaisons. */
export interface OptionActivationFiche {
  readonly id: string;
  readonly status: string;
  readonly variantIds: readonly string[];
}

/** Ce que l'activation sait du groupe, lu au référentiel des options. */
export interface OptionActivationGroup {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
}

/**
 * **Les groupes d'options d'une fiche — l'agrégat** (`plan-options-de-commande.md`,
 * § 3.1). La fiche écrit son activation ; le groupe reste au référentiel.
 *
 * Ce qu'il garantit : une fiche archivée ne change pas ses options (on la
 * restaure d'abord), un groupe archivé ne s'active pas, une liste vise des
 * déclinaisons de CETTE fiche et n'est jamais vide. Une déclinaison au poids
 * accepte les options comme une à la pièce (décision de Hugo du 2026-11-19) :
 * aucun refus ici. Retirer un groupe pose `revokedAt` — la ligne reste.
 */
export class ProductOptionActivations {
  private constructor(
    readonly productId: string,
    private readonly entries: Map<string, OptionActivationSnapshot>,
  ) {}

  static reconstitute(
    productId: string,
    activations: readonly OptionActivationSnapshot[],
  ): ProductOptionActivations {
    return new ProductOptionActivations(
      productId,
      new Map(activations.map((entry) => [entry.groupId, entry])),
    );
  }

  /**
   * Active le groupe sur la fiche, ou change ses déclinaisons.
   *
   * @param variantIds `null` = toutes les déclinaisons.
   * @returns `false` si le groupe y était déjà actif sur les mêmes déclinaisons.
   * @throws {ArchivedProductNotEditableError} la fiche est archivée.
   * @throws {OptionGroupArchivedError} le groupe est archivé.
   * @throws {EmptyOptionVariantListError} la liste est vide.
   * @throws {VariantNotFoundError} une déclinaison n'est pas sous cette fiche.
   */
  activate(
    fiche: OptionActivationFiche,
    group: OptionActivationGroup,
    variantIds: readonly string[] | null,
  ): boolean {
    refuseEditOfArchived(fiche.status, fiche.id, "edit_options");
    if (group.archived) {
      throw new OptionGroupArchivedError(group.name);
    }
    const next: OptionActivationSnapshot = {
      groupId: group.id,
      allVariants: variantIds === null,
      variantIds: variantIds === null ? [] : listedVariants(fiche, group, variantIds),
      revokedAt: null,
    };
    const current = this.entries.get(group.id);
    if (current !== undefined && sameActivation(current, next)) {
      return false;
    }
    this.entries.set(group.id, next);
    return true;
  }

  /**
   * Retire le groupe de la fiche : il n'y est plus proposé.
   *
   * @returns `false` s'il n'y était pas actif.
   * @throws {ArchivedProductNotEditableError} la fiche est archivée.
   */
  deactivate(fiche: OptionActivationFiche, groupId: string, at: Date): boolean {
    refuseEditOfArchived(fiche.status, fiche.id, "edit_options");
    const current = this.entries.get(groupId);
    if (current === undefined || current.revokedAt !== null) {
      return false;
    }
    this.entries.set(groupId, { ...current, revokedAt: at });
    return true;
  }

  /** L'activation d'un groupe, active ou retirée ; `undefined` s'il n'y a jamais été. */
  of(groupId: string): OptionActivationSnapshot | undefined {
    return this.entries.get(groupId);
  }

  snapshot(): readonly OptionActivationSnapshot[] {
    return [...this.entries.values()];
  }
}

function listedVariants(
  fiche: OptionActivationFiche,
  group: OptionActivationGroup,
  variantIds: readonly string[],
): readonly string[] {
  const listed = [...new Set(variantIds)].sort();
  if (listed.length === 0) {
    throw new EmptyOptionVariantListError(group.name);
  }
  const known = new Set(fiche.variantIds);
  for (const variantId of listed) {
    if (!known.has(variantId)) {
      throw new VariantNotFoundError(fiche.id, variantId);
    }
  }
  return listed;
}

function sameActivation(a: OptionActivationSnapshot, b: OptionActivationSnapshot): boolean {
  return (
    a.revokedAt === null &&
    a.allVariants === b.allVariants &&
    a.variantIds.join(",") === b.variantIds.join(",")
  );
}
