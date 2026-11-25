import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { WorkstationAddedToProductsEvent } from "../../domain/events/workstation.events.js";
import { ProductSku } from "../../domain/value-objects/product-sku.js";
import { WorkstationMapGesture } from "../services/workstation-map-gesture.service.js";
import { activeStation } from "../workstation-support.js";
import { AddWorkstationToProductsCommand } from "./add-workstation-to-products.command.js";

/**
 * Un poste de plus pour des produits, en bas de sa pile
 * (`fournil/un-produit-sur-plusieurs-postes.md`, § 2.1) : le premier
 * poste d'un produit le finit, les suivants sont des étapes. **Une fois par
 * intention**. Le fait ne nomme que les produits qui ont réellement gagné le
 * poste ; aucun : rien n'est écrit.
 *
 * @throws {InvalidProductSkuError} @throws {WorkstationNotFoundError}
 * @throws {WorkstationArchivedError}
 */
@CommandHandler(AddWorkstationToProductsCommand)
export class AddWorkstationToProductsHandler implements ICommandHandler<
  AddWorkstationToProductsCommand,
  void
> {
  constructor(
    private readonly gesture: WorkstationMapGesture,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: AddWorkstationToProductsCommand): Promise<void> {
    const products = command.productSkus.map((sku) => ProductSku.of(sku));
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.workstation.add_to_products",
        subject: intentSubject(
          command.workstationId,
          products.map((product) => product.value),
        ),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.gesture.apply(
          command.staffUserId,
          (map) => {
            const added = map.addWorkstationToProducts(products, command.workstationId);
            const station = activeStation(map, command.workstationId);
            return {
              result: undefined,
              events:
                added.products.length === 0
                  ? []
                  : [new WorkstationAddedToProductsEvent(station, added.products, added.finishing)],
            };
          },
          seal,
        ),
    );
  }
}
