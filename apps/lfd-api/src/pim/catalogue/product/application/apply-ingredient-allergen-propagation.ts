import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween, type FieldChanges } from "../../../../platform/journal/changes.js";
import { AllergenCatalogueReader } from "../../../allergens/domain/ports/allergen-catalogue.reader.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";
import type { Product } from "../domain/entities/product.js";
import { IngredientCitationsReader } from "../domain/ports/ingredient-citations.reader.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { VariantAllergensRepository } from "../domain/ports/variant-allergens.repository.js";
import {
  propagatedSheet,
  type VariantPropagation,
} from "../domain/services/ingredient-allergen-propagation.js";
import type { AllergenDeclaration } from "../domain/value-objects/nutrition-declaration.js";
import { validatedAllergens } from "./declaration-support.js";
import {
  loadPropagationPlan,
  type PlannedProduct,
  type PropagationPlan,
} from "./ingredient-allergen-propagation-support.js";
import { namedVariant } from "./product-support.js";

export class ApplyIngredientAllergenPropagationCommand {
  constructor(
    readonly ingredientKey: string,
    readonly added: readonly string[],
    readonly removed: readonly string[],
    /** Les déclinaisons dont la case de retrait a été décochée. */
    readonly removalsKept: readonly string[] = [],
  ) {}
}

/** Une déclaration à écrire, déjà portée par l'agrégat. */
interface PendingDeclaration {
  readonly product: Product;
  readonly variantId: string;
  readonly declaration: AllergenDeclaration;
  readonly changes: FieldChanges;
}

/**
 * **Applique la propagation** des allergènes d'un ingrédient à ses fiches.
 *
 * L'aperçu est **recalculé ici**, jamais reçu de l'écran : une fiche modifiée
 * entre-temps n'est pas écrasée, et seul ce qui est encore proposé s'écrit.
 *
 * Chaque déclinaison suit le chemin de `save-variant-allergens.ts` — mêmes
 * gardes du référentiel (`validatedAllergens`), le verbe de l'agrégat, le port
 * dédié à la seule table des allergènes, le fait `product.allergens_saved`
 * (qui nomme ici l'ingrédient d'origine), puis l'émission. Le tout dans UNE
 * unité de travail : une propagation à moitié faite laisserait des fiches en
 * contradiction sans que l'écran le sache.
 *
 * Toutes les déclarations sont validées AVANT la première écriture. Une
 * déclinaison que la garde refuse est EXCLUE, jamais une cause d'échec global
 * (décision 4 du 2026-10-27) : l'aperçu l'a déjà montrée bloquée (code
 * archivé), et le reste s'applique. Un code promu d'une trace quitte « peut
 * contenir » (décision 3).
 *
 * @throws {PropagationIngredientNotFoundError} aucun ingrédient sous cette clé.
 */
@CommandHandler(ApplyIngredientAllergenPropagationCommand)
export class ApplyIngredientAllergenPropagationHandler implements ICommandHandler<
  ApplyIngredientAllergenPropagationCommand,
  void
> {
  constructor(
    private readonly citations: IngredientCitationsReader,
    private readonly products: ProductRepository,
    private readonly allergenSheets: VariantAllergensRepository,
    private readonly reference: AllergenCatalogueReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: ApplyIngredientAllergenPropagationCommand): Promise<void> {
    const plan = await loadPropagationPlan(
      this.citations,
      this.products,
      this.reference,
      command.ingredientKey,
      { added: command.added, removed: command.removed },
    );
    const kept = new Set(command.removalsKept);
    const pending: PendingDeclaration[] = [];
    for (const planned of plan.products) {
      for (const variant of planned.propagation.variants) {
        const declaration = await this.declarationOf(planned, variant, kept.has(variant.variantId));
        if (declaration !== null) {
          pending.push(declaration);
        }
      }
    }
    if (pending.length === 0) {
      return;
    }
    await this.uow.run(async () => {
      for (const write of pending) {
        await this.write(plan, write);
      }
      await this.emitter.emitProducts([...new Set(pending.map((write) => write.product.id))]);
    });
  }

  /** La déclaration d'après, validée et posée sur l'agrégat — `null` : rien à écrire. */
  private async declarationOf(
    planned: PlannedProduct,
    variant: VariantPropagation,
    removalKept: boolean,
  ): Promise<PendingDeclaration | null> {
    const { product } = planned;
    const sheet = product.resolvedVariants().find((v) => v.id === variant.variantId)?.allergenSheet;
    if (sheet === null || sheet === undefined) {
      return null;
    }
    const after = propagatedSheet(sheet, variant, removalKept);
    const changes = changesBetween(
      { allergens: sheet.declared, mayContain: sheet.mayContain },
      after,
    );
    if (Object.keys(changes).length === 0) {
      return null;
    }
    const declaration = await this.guarded(after, [...sheet.declared, ...sheet.mayContain]);
    if (declaration === null) {
      return null;
    }
    product.declareAllergens(variant.variantId, declaration);
    return { product, variantId: variant.variantId, declaration, changes };
  }

  /**
   * La garde de la saisie à la main — un refus EXCLUT la déclinaison au lieu
   * de faire échouer la propagation entière (décision 4). Seuls les refus
   * métier sont absorbés ; une panne technique remonte.
   */
  private async guarded(
    after: { allergens: string[]; mayContain: string[] },
    alreadyDeclared: readonly string[],
  ): Promise<AllergenDeclaration | null> {
    try {
      return await validatedAllergens(this.reference, after, alreadyDeclared);
    } catch (refusal) {
      if (refusal instanceof DomainError || refusal instanceof BusinessError) {
        return null;
      }
      throw refusal;
    }
  }

  private async write(plan: PropagationPlan, pending: PendingDeclaration): Promise<void> {
    const snapshot = pending.product.snapshot();
    const ticket = await this.journal.trace({
      type: PIM_EVENTS.productAllergensSaved,
      subjectType: "product",
      subjectId: pending.product.id,
      payload: {
        subjectLabel: snapshot.name.fr,
        variant: namedVariant(snapshot, pending.variantId),
        changes: pending.changes,
        fromIngredient: { id: plan.ingredient.key, name: plan.ingredient.name },
      },
    });
    await this.allergenSheets.save(pending.variantId, pending.declaration, ticket);
  }
}
