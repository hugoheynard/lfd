import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { floorScopeKey } from "../../domain/entities/pricing-floor.js";
import { PricingFloorRepository } from "../../domain/ports/pricing-floor.repository.js";
import { PriceFloorNotFoundError } from "../../domain/pricing-errors.js";
import { Clock } from "../../../../platform/time/clock.js";
import { describeFloorPolicy, describeScope } from "../../domain/pricing-act.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { scopeNameOf } from "../scope-names.js";
import { ArchivePriceFloorCommand } from "./archive-price-floor.command.js";
import type { PricingAct } from "../../domain/pricing-act.js";

@CommandHandler(ArchivePriceFloorCommand)
export class ArchivePriceFloorHandler implements ICommandHandler<ArchivePriceFloorCommand, void> {
  constructor(
    private readonly floors: PricingFloorRepository,
    private readonly clock: Clock,
    private readonly catalog: ProductCatalogReader,
  ) {}

  /**
   * **Archiver**, et non supprimer : une limite a arbitré des prix, et savoir
   * qu'elle existait explique des factures.
   *
   * L'acte décrit la limite **telle qu'elle était** — c'est ce qu'on cherche en
   * relisant : « qu'est-ce qui protégeait cet article avant ? ».
   */
  async execute(command: ArchivePriceFloorCommand): Promise<void> {
    const now = this.clock.now();
    const existing = await this.floors.inForceFor(command.scope, now);
    if (existing === null) {
      throw new PriceFloorNotFoundError(command.scope.type, command.scope.id);
    }
    const id = existing.id;
    const act: PricingAct = {
      subjectType: "floor",
      subjectId: floorScopeKey(command.scope),
      kind: "archived",
      actor: command.staffUserId,
      at: now,
      reason: command.reason,
      summary: describeFloorPolicy(existing.toPersistence().policy),
      // Le sujet d'une limite est sa PORTÉE : c'est elle qu'on nomme.
      subjectLabel: describeScope(command.scope, await scopeNameOf(command.scope, this.catalog)),
    };
    if (!(await this.floors.archive(id, act))) {
      throw new PriceFloorNotFoundError(command.scope.type, command.scope.id);
    }
  }
}
