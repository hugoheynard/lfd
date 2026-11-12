import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { PricingFloor, floorSubjectKey } from "../../domain/entities/pricing-floor.js";
import { PricingFloorRepository } from "../../domain/ports/pricing-floor.repository.js";
import { PriceFloorNotFoundError } from "../../domain/pricing-errors.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { referenceCanonicalFor } from "../floor-reference.js";
import { Clock } from "../../../../platform/time/clock.js";
import { type PricingAct, describeFloor, describeScope } from "../../domain/pricing-act.js";
import { scopeNameOf } from "../scope-names.js";
import { ConfirmPriceFloorCommand } from "./confirm-price-floor.command.js";
import { staffViewer } from "../../../catalog/domain/catalog-viewer.js";

/** Le nom stable du geste, dans le registre des intentions. */
const CONFIRM_FLOOR_GESTURE = "pricing.confirm-price-floor";

/**
 * **Confirmer une limite**, une fois par intention : confirmer redate la
 * limite et écrit un acte `confirmed` — un double clic en écrirait deux. La
 * clé de l'écran est scellée dans la transaction de la confirmation.
 *
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour une autre limite.
 */
@CommandHandler(ConfirmPriceFloorCommand)
export class ConfirmPriceFloorHandler implements ICommandHandler<ConfirmPriceFloorCommand, void> {
  constructor(
    private readonly floors: PricingFloorRepository,
    private readonly catalog: ProductCatalogReader,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * **Confirmer** : la limite ne change pas, sa référence et sa date si.
   *
   * C'est ce qui éteint le signal de dérive. Sans ce geste, la seule façon de le
   * faire taire serait de MODIFIER la limite — donc de changer une décision pour
   * se débarrasser d'un rappel, ce qui est l'inverse du but.
   *
   * L'acte porte son propre verbe, `confirmed` : le confondre avec `posed`
   * effacerait du journal la seule chose qu'on y cherche — quelqu'un a-t-il
   * REVU cette limite, ou traîne-t-elle depuis deux ans ?
   */
  execute(command: ConfirmPriceFloorCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: CONFIRM_FLOOR_GESTURE,
        subject: `${command.scope.type}:${command.scope.id ?? ""}|${command.clientele}`,
      },
      NOTHING_TO_REPLAY,
      (seal) => this.confirm(command, seal),
    );
  }

  private async confirm(
    command: ConfirmPriceFloorCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    const now = this.clock.now();
    const existing = await this.floors.inForceFor(command.scope, command.clientele, now);
    if (existing === null) {
      throw new PriceFloorNotFoundError(command.scope.type, command.scope.id, command.clientele);
    }
    const state = existing.toPersistence();
    const floor = PricingFloor.pose(
      this.ids.next(),
      state.scope,
      state.clientele,
      state.policy,
      command.staffUserId,
      now,
      referenceCanonicalFor(state.scope, await this.catalog.all(staffViewer("pro"))),
    );
    const act: PricingAct = {
      subjectType: "floor",
      subjectId: floorSubjectKey(state.scope, state.clientele),
      kind: "confirmed",
      actor: command.staffUserId,
      at: now,
      reason: null,
      summary: describeFloor(state.clientele, state.policy),
      // Le sujet d'une limite est sa PORTÉE : c'est elle qu'on nomme.
      subjectLabel: describeScope(state.scope, await scopeNameOf(state.scope, this.catalog)),
    };
    await this.uow.run(async () => {
      await this.floors.pose(floor, act);
      await seal();
    });
  }
}
