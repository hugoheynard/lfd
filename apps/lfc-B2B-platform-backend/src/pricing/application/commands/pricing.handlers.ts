import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../infra/id/id-generator.js";
import { PricingFloor, floorIdForScope } from "../../domain/entities/pricing-floor.js";
import { PricingRule } from "../../domain/entities/pricing-rule.js";
import { PricingFloorRepository } from "../../domain/ports/pricing-floor.repository.js";
import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { PriceRuleNotFoundError, PriceFloorNotFoundError } from "../../domain/pricing-errors.js";
import { ProductCatalogReader } from "../../../orders/domain/ports/product-catalog.reader.js";
import { referenceCanonicalFor } from "../floor-reference.js";
import {
  ConfirmPriceFloorCommand,
  CreatePriceRuleCommand,
  RemovePriceFloorCommand,
  RemovePriceRuleCommand,
  SetPriceFloorCommand,
} from "./pricing.commands.js";

/**
 * Les quatre gestes du staff sur la tarification.
 *
 * Aucun handler ne décide d'un refus : les refus vivent dans les agrégats, où le
 * prochain appelant — un import, un seed, le planificateur des paniers
 * récurrents — les trouvera aussi. Ici il n'y a que le cycle : fabriquer
 * l'agrégat, le rendre au port.
 */
@CommandHandler(CreatePriceRuleCommand)
export class CreatePriceRuleHandler implements ICommandHandler<CreatePriceRuleCommand, string> {
  constructor(
    private readonly rules: PricingRuleRepository,
    private readonly ids: IdGenerator,
  ) {}

  /** Rend l'identifiant posé : l'écran en a besoin pour cibler la suppression. */
  async execute(command: CreatePriceRuleCommand): Promise<string> {
    const rule = PricingRule.create(this.ids.next(), command.draft, command.staffSub);
    await this.rules.save(rule);
    return rule.id;
  }
}

@CommandHandler(RemovePriceRuleCommand)
export class RemovePriceRuleHandler implements ICommandHandler<RemovePriceRuleCommand, void> {
  constructor(private readonly rules: PricingRuleRepository) {}

  /**
   * Une règle déjà retirée est un **404**, pas un silence : deux personnes
   * peuvent avoir le même écran ouvert, et celle qui arrive seconde mérite de
   * savoir que son geste n'a rien fait plutôt que de croire qu'il a marché.
   */
  async execute(command: RemovePriceRuleCommand): Promise<void> {
    if (!(await this.rules.remove(command.id))) {
      throw new PriceRuleNotFoundError(command.id);
    }
  }
}

@CommandHandler(SetPriceFloorCommand)
export class SetPriceFloorHandler implements ICommandHandler<SetPriceFloorCommand, void> {
  constructor(
    private readonly floors: PricingFloorRepository,
    private readonly catalog: ProductCatalogReader,
  ) {}

  /**
   * Poser une limite fige le **tarif représentatif** des articles visées. C'est
   * lui qui permettra, six mois plus tard, de dire que l'intention a vieilli —
   * sans référence, le tarif d'aujourd'hui ne se compare à rien.
   */
  async execute(command: SetPriceFloorCommand): Promise<void> {
    await this.floors.pose(
      PricingFloor.pose(
        command.scope,
        command.policy,
        command.staffSub,
        referenceCanonicalFor(command.scope, this.catalog.all()),
      ),
    );
  }
}

@CommandHandler(ConfirmPriceFloorCommand)
export class ConfirmPriceFloorHandler implements ICommandHandler<ConfirmPriceFloorCommand, void> {
  constructor(
    private readonly floors: PricingFloorRepository,
    private readonly catalog: ProductCatalogReader,
  ) {}

  /**
   * **Confirmer** : la limite ne change pas, sa référence et sa date si.
   *
   * C'est ce qui éteint le signal de dérive. Sans ce geste, la seule façon de le
   * faire taire serait de MODIFIER la limite — donc de changer une décision pour
   * se débarrasser d'un rappel, ce qui est l'inverse du but.
   */
  async execute(command: ConfirmPriceFloorCommand): Promise<void> {
    const existing = await this.floors.load(floorIdForScope(command.scope));
    if (existing === null) {
      throw new PriceFloorNotFoundError(command.scope.type, command.scope.id);
    }
    const state = existing.toPersistence();
    await this.floors.pose(
      PricingFloor.pose(
        state.scope,
        state.policy,
        command.staffSub,
        referenceCanonicalFor(state.scope, this.catalog.all()),
      ),
    );
  }
}

@CommandHandler(RemovePriceFloorCommand)
export class RemovePriceFloorHandler implements ICommandHandler<RemovePriceFloorCommand, void> {
  constructor(private readonly floors: PricingFloorRepository) {}

  async execute(command: RemovePriceFloorCommand): Promise<void> {
    if (!(await this.floors.remove(floorIdForScope(command.scope)))) {
      throw new PriceFloorNotFoundError(command.scope.type, command.scope.id);
    }
  }
}
