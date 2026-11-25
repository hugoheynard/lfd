import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { FinishingWorkstationSetEvent } from "../../domain/events/workstation.events.js";
import { ProductSku } from "../../domain/value-objects/product-sku.js";
import { WorkstationMapGesture } from "../services/workstation-map-gesture.service.js";
import { activeStation } from "../workstation-support.js";
import { SetFinishingWorkstationCommand } from "./set-finishing-workstation.command.js";

/**
 * Ce poste finit désormais le produit : seul son « Fait » comptera des pièces
 * (`fournil/plan-produit-sur-plusieurs-postes.md`, § 2.4). Celui qui le
 * finissait devient une étape. **Une fois par intention** ; le poste qui
 * finit déjà, redésigné, n'écrit ni ne journalise rien.
 *
 * @throws {InvalidProductSkuError} @throws {WorkstationNotFoundError}
 * @throws {WorkstationArchivedError}
 * @throws {WorkstationNotOfProductError} le poste n'est pas encore un poste du produit.
 */
@CommandHandler(SetFinishingWorkstationCommand)
export class SetFinishingWorkstationHandler implements ICommandHandler<
  SetFinishingWorkstationCommand,
  void
> {
  constructor(
    private readonly gesture: WorkstationMapGesture,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: SetFinishingWorkstationCommand): Promise<void> {
    const product = ProductSku.of(command.productSku);
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.workstation.set_finishing",
        subject: intentSubject(command.workstationId, [product.value]),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.gesture.apply(
          command.staffUserId,
          (map) => {
            const before = map.workstationOf(product.value);
            const changed = map.setFinishingWorkstation(product, command.workstationId) !== null;
            const station = activeStation(map, command.workstationId);
            const previous =
              before === null ? null : (map.active().find(({ id }) => id === before) ?? null);
            return {
              result: undefined,
              events: changed
                ? [new FinishingWorkstationSetEvent(station, product.value, previous)]
                : [],
            };
          },
          seal,
        ),
    );
  }
}
