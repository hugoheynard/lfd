import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { WorkstationProductsPlacedEvent } from "../../domain/events/workstation.events.js";
import { ProductSku } from "../../domain/value-objects/product-sku.js";
import { WorkstationMapGesture } from "../services/workstation-map-gesture.service.js";
import { PlaceProductsCommand } from "./place-products.command.js";

/** Le sujet d'une intention de placement qui remet « à ranger ». */
const UNPLACED_TARGET = "unplaced";

/**
 * Place des produits sur un seul poste, qui les finit, ou les remet « à
 * ranger » ; leurs autres postes les quittent — « tout ce rayon → ce poste »
 * passe ici, sans laisser de règle (plan
 * `documentation/fournil/les-postes-du-fournil.md`, § 3.8). **Une fois par intention**.
 * Le fait ne nomme que les produits qui ont réellement changé ; aucun : rien
 * n'est écrit.
 *
 * @throws {InvalidProductSkuError} @throws {WorkstationNotFoundError}
 * @throws {WorkstationArchivedError}
 */
@CommandHandler(PlaceProductsCommand)
export class PlaceProductsHandler implements ICommandHandler<PlaceProductsCommand, void> {
  constructor(
    private readonly gesture: WorkstationMapGesture,
    private readonly intents: OncePerIntent,
  ) {}

  async execute(command: PlaceProductsCommand): Promise<void> {
    const products = command.productSkus.map((sku) => ProductSku.of(sku));
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.workstation.place",
        subject: intentSubject(
          command.workstationId ?? UNPLACED_TARGET,
          products.map((product) => product.value),
        ),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.gesture.apply(
          command.staffUserId,
          (map) => {
            const moved = map.place(products, command.workstationId);
            const station =
              command.workstationId === null
                ? null
                : (map.active().find((candidate) => candidate.id === command.workstationId) ??
                  null);
            return {
              result: undefined,
              events:
                moved.length === 0 ? [] : [new WorkstationProductsPlacedEvent(station, moved)],
            };
          },
          seal,
        ),
    );
  }
}
