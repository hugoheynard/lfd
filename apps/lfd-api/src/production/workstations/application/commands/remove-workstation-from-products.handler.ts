import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { WorkstationRemovedFromProductsEvent } from "../../domain/events/workstation.events.js";
import { ProductSku } from "../../domain/value-objects/product-sku.js";
import { WorkstationMapGesture } from "../services/workstation-map-gesture.service.js";
import { activeStation } from "../workstation-support.js";
import { RemoveWorkstationFromProductsCommand } from "./remove-workstation-from-products.command.js";

/**
 * Un poste quitte des produits (`fournil/un-produit-sur-plusieurs-postes.md`,
 * § 2.1). Le dernier poste d'un produit le remet « à ranger » ; celui qui
 * finit ne part pas tant qu'il en reste d'autres — la carte refuse tout le
 * geste. **Une fois par intention**. Le poste quitté est réécrit : le numéro
 * de la carte monte, et la fiche gardée se refait.
 *
 * @throws {InvalidProductSkuError} @throws {WorkstationNotFoundError}
 * @throws {WorkstationArchivedError}
 * @throws {FinishingWorkstationStillNeededError}
 */
@CommandHandler(RemoveWorkstationFromProductsCommand)
export class RemoveWorkstationFromProductsHandler implements ICommandHandler<
  RemoveWorkstationFromProductsCommand,
  void
> {
  constructor(
    private readonly gesture: WorkstationMapGesture,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: RemoveWorkstationFromProductsCommand): Promise<void> {
    const products = command.productSkus.map((sku) => ProductSku.of(sku));
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.workstation.remove_from_products",
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
            const removed = map.removeWorkstationFromProducts(products, command.workstationId);
            const station = activeStation(map, command.workstationId);
            return {
              result: undefined,
              events:
                removed.products.length === 0
                  ? []
                  : [
                      new WorkstationRemovedFromProductsEvent(
                        station,
                        removed.products,
                        removed.unplaced,
                      ),
                    ],
            };
          },
          seal,
        ),
    );
  }
}
