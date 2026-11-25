import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { WorkstationProductsReorderedEvent } from "../../domain/events/workstation.events.js";
import { ProductSku } from "../../domain/value-objects/product-sku.js";
import { WorkstationMapGesture } from "../services/workstation-map-gesture.service.js";
import { ReorderWorkstationProductsCommand } from "./reorder-workstation-products.command.js";

/**
 * Pose la pile d'un poste : l'ordre dans lequel il voit ses produits partout
 * où le mode prod range (`documentation/fournil/les-postes-du-fournil.md`,
 * « La pile d'un poste »). **Une fois par intention**. La même pile, reposée,
 * n'écrit ni ne journalise rien.
 *
 * @throws {InvalidProductSkuError} @throws {WorkstationNotFoundError}
 * @throws {WorkstationArchivedError}
 * @throws {WorkstationOrderMismatchError} la liste n'est pas exactement la pile du poste.
 */
@CommandHandler(ReorderWorkstationProductsCommand)
export class ReorderWorkstationProductsHandler implements ICommandHandler<
  ReorderWorkstationProductsCommand,
  void
> {
  constructor(
    private readonly gesture: WorkstationMapGesture,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: ReorderWorkstationProductsCommand): Promise<void> {
    const products = command.productSkus.map((sku) => ProductSku.of(sku));
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.workstation.reorder_products",
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
            map.reorderProducts(command.workstationId, products);
            const station = map
              .active()
              .find((candidate) => candidate.id === command.workstationId);
            const moved = map.changes().placements.size > 0;
            return {
              result: undefined,
              events:
                moved && station !== undefined
                  ? [
                      new WorkstationProductsReorderedEvent(
                        station,
                        products.map((product) => product.value),
                      ),
                    ]
                  : [],
            };
          },
          seal,
        ),
    );
  }
}
