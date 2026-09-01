import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { AllergenCatalogueReader } from "../../allergens/domain/ports/allergen-catalogue.reader.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import {
  ArchivedIngredientAllergenError,
  IngredientNotFoundError,
  UnknownIngredientAllergenError,
} from "../domain/errors/ingredient-errors.js";
import { IngredientRepository } from "../domain/ports/ingredient.repository.js";

export class SetIngredientAllergensCommand {
  constructor(
    readonly key: string,
    readonly codes: readonly string[],
  ) {}
}

/**
 * Pose ce qu'une matière **contient**, la liste entière.
 *
 * Par l'agrégat et son verbe, puis `save()` — et non par une écriture ciblée du
 * dépôt : ce que contient un ingrédient est un fait qui lui appartient (la
 * liaison meurt avec lui, en `Cascade`), là où ce qu'une **fiche** cite comme
 * ingrédients est un lien entre deux agrégats dont ce module ne possède qu'un
 * bout — d'où le `setOfProduct` du dépôt, à côté, qui n'est pas le même geste.
 *
 * **Un seul fait pour la liste entière**, avec l'AVANT et l'APRÈS en codes :
 * même raison qu'`ingredients_saved`, N traces pour N lignes noieraient
 * l'historique de la matière.
 *
 * Le périmètre offert est `world` (D4) : aucun filtre sur l'annexe II ici. Une
 * farine qui contient du sarrasin en contient, que l'Europe l'exige ou non ; le
 * filtre européen appartient à la **déclaration**, pas à la matière.
 */
@CommandHandler(SetIngredientAllergensCommand)
export class SetIngredientAllergensHandler implements ICommandHandler<
  SetIngredientAllergensCommand,
  void
> {
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly reference: AllergenCatalogueReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetIngredientAllergensCommand): Promise<void> {
    const { key, codes } = command;
    const ingredient = await this.ingredients.findByKey(key);
    if (ingredient === null) {
      throw new IngredientNotFoundError(key);
    }
    const before = ingredient.snapshot().allergens;
    await assertDeclarable(this.reference, codes, before);
    ingredient.declareAllergens(codes);
    const after = ingredient.snapshot().allergens;
    const unchanged =
      before.length === after.length && before.every((code, at) => code === after[at]);

    await this.uow.run(async () => {
      const ticket = unchanged
        ? this.journal.untraced("record without modification")
        : await this.journal.trace({
            type: PIM_EVENTS.ingredientAllergensSaved,
            subjectType: "ingredient",
            subjectId: key,
            payload: { changes: { allergens: { from: [...before], to: [...after] } } },
          });
      await this.ingredients.save(ingredient, ticket);
    });
  }
}

/**
 * Confronte les codes reçus au **référentiel en base**, avant que l'agrégat ne
 * les prenne.
 *
 * Deux questions, deux réponses — les confondre casse la fonctionnalité
 * (D2 bis), exactement comme sur la fiche réglementaire :
 *
 * - « ce code est-il valide ? » — oui, **archivés compris**. `knownCodes()` les
 *   rend, et c'est voulu : une matière renseignée hier porte un code que le
 *   staff archive demain, et la relire ne doit pas la rendre inenregistrable ;
 * - « peut-on l'ajouter ? » — non s'il est archivé. Le refus dépend de ce que la
 *   matière portait **déjà**, sans quoi corriger son origine échouerait sur un
 *   allergène que personne n'a touché.
 *
 * Le refus vit ici et pas dans l'agrégat pour la raison de D3 : le référentiel
 * est en base, le domaine ne le cherche pas.
 *
 * @param alreadyPosed les codes que la matière portait avant ce geste.
 * @throws {UnknownIngredientAllergenError} un code que le référentiel ignore.
 * @throws {ArchivedIngredientAllergenError} un code archivé posé à neuf.
 */
async function assertDeclarable(
  reference: AllergenCatalogueReader,
  codes: readonly string[],
  alreadyPosed: readonly string[],
): Promise<void> {
  const [known, catalogue] = await Promise.all([reference.knownCodes(), reference.catalogue()]);
  const archived = new Set(
    catalogue.flatMap((category) =>
      category.entries.filter((entry) => entry.archivedAt !== null).map((entry) => entry.code),
    ),
  );
  const kept = new Set(alreadyPosed);
  for (const code of codes) {
    if (!known.has(code)) {
      throw new UnknownIngredientAllergenError(code);
    }
    if (archived.has(code) && !kept.has(code)) {
      throw new ArchivedIngredientAllergenError(code);
    }
  }
}
