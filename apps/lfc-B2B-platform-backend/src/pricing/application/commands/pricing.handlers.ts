import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../infra/id/id-generator.js";
import { PricingFloor, floorIdForScope } from "../../domain/entities/pricing-floor.js";
import { PricingRule } from "../../domain/entities/pricing-rule.js";
import { PricingFloorRepository } from "../../domain/ports/pricing-floor.repository.js";
import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { PriceFloorNotFoundError } from "../../domain/pricing-errors.js";
import { ProductCatalogReader } from "../../../orders/domain/ports/product-catalog.reader.js";
import { referenceCanonicalFor } from "../floor-reference.js";
import { Clock } from "../../../infra/time/clock.js";
import { describeFloorPolicy, describeRule } from "../../domain/pricing-act.js";
import {
  ArchivePriceFloorCommand,
  ConfirmPriceFloorCommand,
  CreatePriceRuleCommand,
  SetPriceFloorCommand,
} from "./pricing.commands.js";
import type { PriceScope } from "../../domain/price-rule.js";
import type { PriceFloorPolicy } from "../../domain/floor-policy.js";
import type { PricingAct, PricingActKind } from "../../domain/pricing-act.js";

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
    private readonly clock: Clock,
  ) {}

  /** Rend l'identifiant posé : l'écran en a besoin pour cibler ses gestes. */
  async execute(command: CreatePriceRuleCommand): Promise<string> {
    const rule = PricingRule.create(this.ids.next(), command.draft, command.staffSub);
    await this.rules.save(rule, {
      subjectType: "rule",
      subjectId: rule.id,
      kind: "posed",
      actor: command.staffSub,
      at: this.clock.now(),
      reason: null,
      summary: describeRule(rule.asPriceRule),
    });
    return rule.id;
  }
}

@CommandHandler(SetPriceFloorCommand)
export class SetPriceFloorHandler implements ICommandHandler<SetPriceFloorCommand, void> {
  constructor(
    private readonly floors: PricingFloorRepository,
    private readonly catalog: ProductCatalogReader,
    private readonly clock: Clock,
  ) {}

  /**
   * Poser une limite fige le **tarif représentatif** des articles visés. C'est
   * lui qui permettra, six mois plus tard, de dire que l'intention a vieilli —
   * sans référence, le tarif d'aujourd'hui ne se compare à rien.
   *
   * L'acte est `replaced` quand une limite était déjà posée sur cette portée, et
   * `posed` sinon. La distinction n'est pas cosmétique : relire « remplacée »
   * apprend qu'une décision antérieure existait, et invite à chercher laquelle.
   */
  async execute(command: SetPriceFloorCommand): Promise<void> {
    const existing = await this.floors.load(floorIdForScope(command.scope));
    await this.pose(
      command.scope,
      command.policy,
      command.staffSub,
      existing === null ? "posed" : "replaced",
    );
  }

  private async pose(
    scope: PriceScope,
    policy: PriceFloorPolicy,
    staffSub: string,
    kind: PricingActKind,
  ): Promise<void> {
    const floor = PricingFloor.pose(
      scope,
      policy,
      staffSub,
      referenceCanonicalFor(scope, this.catalog.all()),
    );
    await this.floors.pose(floor, {
      subjectType: "floor",
      subjectId: floor.id,
      kind,
      actor: staffSub,
      at: this.clock.now(),
      reason: null,
      summary: describeFloorPolicy(policy),
    });
  }
}

@CommandHandler(ConfirmPriceFloorCommand)
export class ConfirmPriceFloorHandler implements ICommandHandler<ConfirmPriceFloorCommand, void> {
  constructor(
    private readonly floors: PricingFloorRepository,
    private readonly catalog: ProductCatalogReader,
    private readonly clock: Clock,
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
    const existing = await this.floors.load(floorIdForScope(command.scope));
    if (existing === null) {
      throw new PriceFloorNotFoundError(command.scope.type, command.scope.id);
    }
    const state = existing.toPersistence();
    const floor = PricingFloor.pose(
      state.scope,
      state.policy,
      command.staffSub,
      referenceCanonicalFor(state.scope, this.catalog.all()),
    );
    await this.floors.pose(floor, {
      subjectType: "floor",
      subjectId: floor.id,
      kind: "confirmed",
      actor: command.staffSub,
      at: this.clock.now(),
      reason: null,
      summary: describeFloorPolicy(state.policy),
    });
  }
}

@CommandHandler(ArchivePriceFloorCommand)
export class ArchivePriceFloorHandler implements ICommandHandler<ArchivePriceFloorCommand, void> {
  constructor(
    private readonly floors: PricingFloorRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * **Archiver**, et non supprimer : une limite a arbitré des prix, et savoir
   * qu'elle existait explique des factures.
   *
   * L'acte décrit la limite **telle qu'elle était** — c'est ce qu'on cherche en
   * relisant : « qu'est-ce qui protégeait cet article avant ? ».
   */
  async execute(command: ArchivePriceFloorCommand): Promise<void> {
    const id = floorIdForScope(command.scope);
    const existing = await this.floors.load(id);
    if (existing === null) {
      throw new PriceFloorNotFoundError(command.scope.type, command.scope.id);
    }
    const act: PricingAct = {
      subjectType: "floor",
      subjectId: id,
      kind: "archived",
      actor: command.staffSub,
      at: this.clock.now(),
      reason: command.reason,
      summary: describeFloorPolicy(existing.toPersistence().policy),
    };
    if (!(await this.floors.archive(id, act))) {
      throw new PriceFloorNotFoundError(command.scope.type, command.scope.id);
    }
  }
}
