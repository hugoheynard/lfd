import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import { effectiveAudience, type Audience } from "../../../shared/domain/value-objects/audience.js";
import type { ProductStatus } from "../entities/product-state.js";
import type { VariantSnapshot } from "../entities/variant.js";
import { activationGapsOf, type ActivationGaps } from "./activation-gaps.js";
import {
  isCompliantForActivation,
  productCompliance,
  type ComplianceFinding,
} from "./product-compliance.js";
import type { CompletenessRules } from "./variant-completeness.js";

/**
 * Ce que le jugement reçoit RÉSOLU, dans l'ordre où chaque appelant le passe :
 * les taux de la famille, les contextes en service, les allergènes cités, et
 * l'audience de la famille.
 */
export type CompletenessInputs = readonly [
  vatPercents: CategoryVatPercents,
  rules: CompletenessRules,
  citedAllergens: readonly string[],
  categoryAudience: Audience,
];

/**
 * **Le jugement de complétude d'une fiche**, sans rien muter : ce qui manque
 * pour l'activer, ses constats, et si l'activer changerait quelque chose.
 *
 * Un service de domaine et non des méthodes de l'agrégat : il ne lit que ce
 * que `Product` lui prête (statut, déclinaisons RÉSOLUES, audience propre) et
 * l'agrégat, qui l'appelle aussi pour REFUSER `activate`, n'a ainsi qu'un seul
 * jugement — la liste dit « activable » avec exactement le code qui accepte
 * ou refuse le geste.
 *
 * **Invariant 7** : on ne met pas en vente ce qu'on ne peut pas étiqueter — le
 * refus se fait **par construction**, déclinaison par déclinaison. Activer
 * exige **au moins une déclinaison non arrêtée complète** (un prix public, un
 * prix pro HT saisi, un taux pour chaque contexte de vente en service). Les
 * allergènes ne refusent plus rien (la composition corrige la déclaration
 * servie, l'absence se sert par précaution : `effective-allergens.ts`), et les
 * valeurs nutritionnelles n'entrent PAS dans ce compte : le règlement (UE)
 * n° 1169/2011 les exempte dans les deux cas de vente de La Folie Coffee
 * (art. 9 §1 c) et l)). Un produit archivé se restaure d'abord.
 *
 * Les taux et les contextes arrivent résolus : ils dépendent de registres que
 * la fiche ne voit pas. `citedAllergens` est ce que portent les ingrédients
 * qu'elle cite (résolu par le handler) ; `categoryAudience` est celle de sa
 * famille, dont elle hérite si elle n'en pose pas — un prix n'est exigé que
 * pour l'audience visée.
 */
export class ProductCompleteness {
  private constructor(
    private readonly status: ProductStatus,
    private readonly resolvedVariants: readonly VariantSnapshot[],
    private readonly ownAudience: Audience | null,
  ) {}

  /** `variants` : les déclinaisons RÉSOLUES — une alignée porte le prix et la déclaration du défaut. */
  static of(input: {
    readonly status: ProductStatus;
    readonly variants: readonly VariantSnapshot[];
    readonly audience: Audience | null;
  }): ProductCompleteness {
    return new ProductCompleteness(input.status, input.variants, input.audience);
  }

  /** Tous les constats, bloquants et avertissements, quel que soit le statut. */
  findings(
    ...[vatPercents, rules, citedAllergens, categoryAudience]: CompletenessInputs
  ): ComplianceFinding[] {
    return productCompliance(
      this.resolvedVariants,
      vatPercents,
      rules,
      citedAllergens,
      effectiveAudience(this.ownAudience, categoryAudience),
    );
  }

  /** Ce qui manque pour activer. Le statut est l'affaire de {@link isActivatable}. */
  gaps(
    ...[vatPercents, rules, citedAllergens, categoryAudience]: CompletenessInputs
  ): ActivationGaps {
    return activationGapsOf(this.findings(vatPercents, rules, citedAllergens, categoryAudience));
  }

  /**
   * Une activation **changerait-elle** la fiche ? Vrai seulement pour un
   * brouillon complet : une publiée n'est pas « à activer », une archivée se
   * restaure d'abord. Le filtre « Activables » de la liste ne montre ainsi que
   * ce que « Activer » ferait passer en vente (décidé le 2026-10-26).
   */
  isActivatable(
    ...[vatPercents, rules, citedAllergens, categoryAudience]: CompletenessInputs
  ): boolean {
    return (
      this.status === "draft" &&
      isCompliantForActivation(this.findings(vatPercents, rules, citedAllergens, categoryAudience))
    );
  }
}
