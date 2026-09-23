import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../../platform/journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type { VariantNutritionValues } from "../domain/entities/variant.js";
import { NutritionValuesRepository } from "../domain/ports/nutrition-values.repository.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import {
  nutritionValues,
  type NutritionValues,
} from "../domain/value-objects/nutrition-declaration.js";
import { namedVariant, requireProduct } from "./product-support.js";

/** Ce que la section « Nutrition » envoie — les valeurs pour 100 g. */
export type SaveVariantNutritionInput = NutritionValues;

export class SaveVariantNutritionCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
    readonly input: SaveVariantNutritionInput,
  ) {}
}

/**
 * **Déclare ce qu'une déclinaison vaut** — les mentions de l'annexe XV.
 *
 * Elle n'écrit QUE la table des valeurs, et elle ne connaît **pas** le
 * référentiel des allergènes : il n'y a plus un seul code à valider de ce
 * côté-ci, et lui laisser le lecteur aurait gardé ouverte la porte par laquelle
 * enregistrer un tableau nutritionnel touchait une déclaration de sécurité.
 */
@CommandHandler(SaveVariantNutritionCommand)
export class SaveVariantNutritionHandler implements ICommandHandler<
  SaveVariantNutritionCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly values: NutritionValuesRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SaveVariantNutritionCommand): Promise<void> {
    const { productId, variantId, input } = command;
    const product = await requireProduct(this.products, productId);
    product.requireVariant(variantId);
    const variant = product.snapshot().variants.find((candidate) => candidate.id === variantId);
    // Valides ou rien, et sans référentiel : un « dont » ne peut pas dépasser sa
    // ligne, une valeur ne peut pas être négative, et ce tableau s'imprime.
    const declared = nutritionValues(input);
    // L'agrégat porte les valeurs AVANT qu'on les écrive, pour la raison qui
    // vaut pour les allergènes : sans ça il répond sur l'état d'avant.
    //
    // 🔴 Il ne PERSISTE pas pour autant : l'écriture reste au port dédié, qui
    // n'écrit que cette table (§6a du plan). La confier à `products.save` ferait
    // qu'un renommage ou une publication écrase une saisie faite entre temps,
    // par les douze appelants qu'il a.
    const flat = flattened(declared);
    product.declareNutritionValues(variantId, flat);
    const changes = changesBetween(previous(variant?.nutrition ?? null), flat);

    await this.uow.run(async () => {
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.productNutritionSaved,
              subjectType: "product",
              subjectId: productId,
              payload: {
                subjectLabel: product.snapshot().name.fr,
                variant: namedVariant(product.snapshot(), variantId),
                changes,
              },
            })
          : this.journal.untraced("section enregistrée sans modification");
      await this.values.save(variantId, declared, ticket);
    });
  }
}

/**
 * Les huit valeurs à plat et **dans l'ordre de l'annexe XV** — celui du tableau
 * imprimé, donc celui dans lequel l'historique les listera.
 *
 * `undefined` (« pas fourni » côté value object) devient `null` (« pas
 * renseigné ») : à la lecture d'un journal, les deux disent la même chose.
 */
function flattened(values: NutritionValues): VariantNutritionValues {
  return {
    energyKcal: values.energyKcal ?? null,
    fatG: values.fatG ?? null,
    saturatedFatG: values.saturatedFatG ?? null,
    carbsG: values.carbsG ?? null,
    sugarsG: values.sugarsG ?? null,
    proteinG: values.proteinG ?? null,
    saltG: values.saltG ?? null,
    glycemicIndex: values.glycemicIndex ?? null,
  };
}

/**
 * L'état d'avant. Un instantané absent rend des `null` partout : l'absence de
 * fiche se lit alors comme « rien n'était renseigné », ce qui était vrai.
 */
function previous(snapshot: VariantNutritionValues | null): VariantNutritionValues {
  return {
    energyKcal: snapshot?.energyKcal ?? null,
    fatG: snapshot?.fatG ?? null,
    saturatedFatG: snapshot?.saturatedFatG ?? null,
    carbsG: snapshot?.carbsG ?? null,
    sugarsG: snapshot?.sugarsG ?? null,
    proteinG: snapshot?.proteinG ?? null,
    saltG: snapshot?.saltG ?? null,
    glycemicIndex: snapshot?.glycemicIndex ?? null,
  };
}
