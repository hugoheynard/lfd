import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { AllergenCatalogueReader } from "../../../allergens/domain/ports/allergen-catalogue.reader.js";
import { changesBetween } from "../../../journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { NutritionRepository } from "../domain/ports/nutrition.repository.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { validatedDeclaration, type DeclarationInput } from "./declaration-support.js";
import { requireProduct } from "./product-support.js";

/** La fiche telle que le formulaire l'envoie — la forme partagée avec la création. */
export type DeclareNutritionInput = DeclarationInput;

export class DeclareProductNutritionCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
    readonly input: DeclareNutritionInput,
  ) {}
}

/** (Re)déclare la fiche réglementaire d'une déclinaison (doc 03). */
@CommandHandler(DeclareProductNutritionCommand)
export class DeclareProductNutritionHandler implements ICommandHandler<
  DeclareProductNutritionCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly nutrition: NutritionRepository,
    private readonly allergens: AllergenCatalogueReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DeclareProductNutritionCommand): Promise<void> {
    const { productId, variantId, input } = command;
    const product = await requireProduct(this.products, productId);
    product.requireVariant(variantId);
    const variant = product.snapshot().variants.find((candidate) => candidate.id === variantId);
    // Ce que la fiche déclarait DÉJÀ, traces comprises : c'est la seule chose
    // qui distingue un code archivé qu'on rééditerait d'un code archivé qu'on
    // ajouterait (D2 bis). Sans elle, corriger une valeur nutritionnelle
    // échouerait sur un allergène que personne n'a touché.
    const alreadyDeclared = [
      ...(variant?.allergens ?? []),
      ...(variant?.nutrition?.mayContain ?? []),
    ];
    const declaration = await validatedDeclaration(this.allergens, input, alreadyDeclared);
    const changes = changesBetween(
      {
        // `null` (fiche jamais renseignée) et `[]` (« aucun allergène »
        // déclaré) ne sont PAS la même chose — le diff doit les distinguer,
        // c'est même le premier fait qu'on veut pouvoir retrouver.
        allergens: variant?.allergens ?? null,
        mayContain: variant?.nutrition?.mayContain ?? null,
        ...nutritionOf(variant?.nutrition ?? null),
      },
      {
        allergens: declaration.allergens,
        mayContain: declaration.mayContain,
        ...nutritionOf(declaration),
      },
    );

    await this.uow.run(async () => {
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.productDeclarationSaved,
              subjectType: "product",
              subjectId: productId,
              payload: { variantId, changes },
            })
          : this.journal.untraced("section enregistrée sans modification");
      await this.nutrition.declare(variantId, declaration, ticket);
    });
  }
}

/**
 * Les deux formes que prennent les valeurs : `undefined` dans le VO (« pas
 * fourni »), `null` dans l'instantané lu en base (« pas renseigné »). Le diff
 * les ramène toutes deux à `null`, parce qu'à la lecture d'un journal elles
 * disent la même chose.
 */
interface NutritionLike {
  readonly energyKcal?: number | null | undefined;
  readonly fatG?: number | null | undefined;
  readonly saturatedFatG?: number | null | undefined;
  readonly carbsG?: number | null | undefined;
  readonly sugarsG?: number | null | undefined;
  readonly proteinG?: number | null | undefined;
  readonly saltG?: number | null | undefined;
  readonly glycemicIndex?: number | null | undefined;
}

/**
 * Les valeurs pour 100 g, à plat et **dans l'ordre de l'annexe XV** — c'est
 * l'ordre dans lequel l'historique les listera, donc celui du tableau imprimé.
 *
 * Un instantané absent rend des `null` partout : l'absence de fiche se lit
 * alors comme « rien n'était renseigné », qui est exactement ce qui était vrai.
 */
function nutritionOf(values: NutritionLike | null): Record<string, unknown> {
  return {
    energyKcal: values?.energyKcal ?? null,
    fatG: values?.fatG ?? null,
    saturatedFatG: values?.saturatedFatG ?? null,
    carbsG: values?.carbsG ?? null,
    sugarsG: values?.sugarsG ?? null,
    proteinG: values?.proteinG ?? null,
    saltG: values?.saltG ?? null,
    glycemicIndex: values?.glycemicIndex ?? null,
  };
}
