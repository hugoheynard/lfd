import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { AllergenCatalogueReader } from "../../../allergens/domain/ports/allergen-catalogue.reader.js";
import { changesBetween } from "../../../journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { VariantAllergensRepository } from "../domain/ports/variant-allergens.repository.js";
import { validatedAllergens, type AllergensInput } from "./declaration-support.js";
import { namedVariant, requireProduct } from "./product-support.js";

/** Ce que la section « Allergènes » envoie — des codes, et rien d'autre. */
export type SaveVariantAllergensInput = AllergensInput;

export class SaveVariantAllergensCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
    readonly input: SaveVariantAllergensInput,
  ) {}
}

/**
 * **Déclare ce qu'une déclinaison contient** — allergènes et traces.
 *
 * Elle n'écrit QUE la table des allergènes. Les valeurs nutritionnelles ne sont
 * ni lues ni réécrites : c'est l'objet du chantier (plan
 * `plan-separer-allergenes-et-nutrition.md`), où une requête qui remplaçait tout
 * effaçait ce qu'elle ne renvoyait pas.
 */
@CommandHandler(SaveVariantAllergensCommand)
export class SaveVariantAllergensHandler implements ICommandHandler<
  SaveVariantAllergensCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly allergenSheets: VariantAllergensRepository,
    private readonly reference: AllergenCatalogueReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SaveVariantAllergensCommand): Promise<void> {
    const { productId, variantId, input } = command;
    const product = await requireProduct(this.products, productId);
    product.requireVariant(variantId);
    const variant = product.snapshot().variants.find((candidate) => candidate.id === variantId);
    // Ce que la fiche déclarait DÉJÀ, traces comprises : c'est la seule chose
    // qui distingue un code archivé qu'on rééditerait d'un code archivé qu'on
    // ajouterait (D2 bis). Sans elle, retirer un code de la liste échouerait sur
    // un autre code que personne n'a touché.
    const alreadyDeclared = [
      ...(variant?.allergens ?? []),
      ...(variant?.nutrition?.mayContain ?? []),
    ];
    const declaration = await validatedAllergens(this.reference, input, alreadyDeclared);
    // L'agrégat porte la déclaration AVANT qu'on l'écrive : sans ça, il répond
    // encore sur l'état d'avant, et `isCovered` — que la publication lit juste
    // après — jugerait la déclinaison non couverte alors qu'on vient de la
    // déclarer.
    //
    // 🔴 Il ne PERSISTE pas pour autant : l'écriture reste au port dédié, qui
    // n'écrit que cette table (§6a du plan). La confier à `products.save` ferait
    // qu'un renommage ou une publication écrase une déclaration faite entre
    // temps, par les douze appelants qu'il a.
    product.declareAllergens(variantId, declaration);
    const changes = changesBetween(
      {
        // `null` (jamais renseigné) et `[]` (« aucun allergène » déclaré) ne
        // sont PAS la même chose — le diff doit les distinguer, c'est même le
        // premier fait qu'on veut pouvoir retrouver.
        allergens: variant?.allergens ?? null,
        mayContain: variant?.nutrition?.mayContain ?? null,
      },
      { allergens: declaration.allergens, mayContain: declaration.mayContain },
    );

    await this.uow.run(async () => {
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.productAllergensSaved,
              subjectType: "product",
              subjectId: productId,
              payload: {
                subjectLabel: product.snapshot().name.fr,
                variant: namedVariant(product.snapshot(), variantId),
                changes,
              },
            })
          : this.journal.untraced("section enregistrée sans modification");
      await this.allergenSheets.save(variantId, declaration, ticket);
    });
  }
}
