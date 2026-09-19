import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { PricingFloor, floorScopeKey } from "../../domain/entities/pricing-floor.js";
import { PricingFloorRepository } from "../../domain/ports/pricing-floor.repository.js";
import { PriceFloorNotFoundError } from "../../domain/pricing-errors.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { referenceCanonicalFor } from "../floor-reference.js";
import { Clock } from "../../../../platform/time/clock.js";
import { describeFloorPolicy, describeScope } from "../../domain/pricing-act.js";
import { scopeNameOf } from "../scope-names.js";
import { ConfirmPriceFloorCommand } from "./confirm-price-floor.command.js";

@CommandHandler(ConfirmPriceFloorCommand)
export class ConfirmPriceFloorHandler implements ICommandHandler<ConfirmPriceFloorCommand, void> {
  constructor(
    private readonly floors: PricingFloorRepository,
    private readonly catalog: ProductCatalogReader,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
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
  async execute(command: ConfirmPriceFloorCommand): Promise<void> {
    const now = this.clock.now();
    const existing = await this.floors.inForceFor(command.scope, now);
    if (existing === null) {
      throw new PriceFloorNotFoundError(command.scope.type, command.scope.id);
    }
    const state = existing.toPersistence();
    const floor = PricingFloor.pose(
      this.ids.next(),
      state.scope,
      state.policy,
      command.staffUserId,
      now,
      referenceCanonicalFor(state.scope, await this.catalog.all()),
    );
    await this.floors.pose(floor, {
      subjectType: "floor",
      subjectId: floorScopeKey(state.scope),
      kind: "confirmed",
      actor: command.staffUserId,
      at: now,
      reason: null,
      summary: describeFloorPolicy(state.policy),
      // Le sujet d'une limite est sa PORTÉE : c'est elle qu'on nomme.
      subjectLabel: describeScope(state.scope, await scopeNameOf(state.scope, this.catalog)),
    });
  }
}
