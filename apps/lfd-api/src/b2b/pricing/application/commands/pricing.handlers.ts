import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PricedPeriodIsSealedError } from "../../domain/pricing-errors.js";
import { PricedDecisionsReader } from "../../domain/ports/priced-decisions.reader.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { PricingFloor, floorScopeKey } from "../../domain/entities/pricing-floor.js";
import { PricingRule } from "../../domain/entities/pricing-rule.js";
import { PricingFloorRepository } from "../../domain/ports/pricing-floor.repository.js";
import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { PriceFloorNotFoundError } from "../../domain/pricing-errors.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { referenceCanonicalFor } from "../floor-reference.js";
import { Clock } from "../../../../platform/time/clock.js";
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
    private readonly priced: PricedDecisionsReader,
  ) {}

  /** Rend l'identifiant posé : l'écran en a besoin pour cibler ses gestes. */
  async execute(command: CreatePriceRuleCommand): Promise<string> {
    const rule = PricingRule.create(this.ids.next(), command.draft, command.staffSub);
    // 🔴 **Le recouvrement que la base ne voit pas.** La contrainte d'exclusion
    // est PARTIELLE (`WHERE archived_at IS NULL`) : elle refuse le chevauchement
    // avec une règle en cours, jamais avec une rangé. Depuis que clore borne
    // la fenêtre (R17), une règle rangé garde sa place dans le passé, et poser
    // par-dessus donnerait deux décisions à la même date.
    //
    // ⚠️ Le refus vise « **a facturé** », pas « est passé ». Une règle posé
    // puis rangé dix minutes plus tard n'a rien facturé : le reposer est le
    // geste ordinaire « je me suis trompé, je recommence ».
    const sealed = await this.rules.archivedOverlapping(rule);
    if (sealed.length > 0 && (await this.priced.anyPriced(sealed))) {
      throw new PricedPeriodIsSealedError("règle", rule.toPersistence().validFrom);
    }

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
    private readonly ids: IdGenerator,
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
    const now = this.clock.now();
    const existing = await this.floors.inForceFor(command.scope, now);
    await this.pose(
      command.scope,
      command.policy,
      command.staffSub,
      existing === null ? "posed" : "replaced",
      now,
    );
  }

  private async pose(
    scope: PriceScope,
    policy: PriceFloorPolicy,
    staffSub: string,
    kind: PricingActKind,
    at: Date,
  ): Promise<void> {
    const floor = PricingFloor.pose(
      this.ids.next(),
      scope,
      policy,
      staffSub,
      at,
      referenceCanonicalFor(scope, await this.catalog.all()),
    );
    await this.floors.pose(floor, {
      subjectType: "floor",
      // 🔴 **La PORTÉE, jamais la version.** Le versionnage (R17) a donné un
      // identifiant propre à chaque période ; journaliser celui-là couperait
      // l'histoire en tronçons d'une entrée, et orphelinerait tout ce que le
      // journal contient déjà — écrit quand l'identifiant ÉTAIT la portée.
      //
      // Or la question qu'on pose au journal est « qu'est-ce qui a protégé cet
      // article, et qui l'a décidé ? ». Son sujet est la cible, pas la ligne.
      subjectId: floorScopeKey(scope),
      kind,
      actor: staffSub,
      at,
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
      command.staffSub,
      now,
      referenceCanonicalFor(state.scope, await this.catalog.all()),
    );
    await this.floors.pose(floor, {
      subjectType: "floor",
      subjectId: floorScopeKey(state.scope),
      kind: "confirmed",
      actor: command.staffSub,
      at: now,
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
      actor: command.staffSub,
      at: now,
      reason: command.reason,
      summary: describeFloorPolicy(existing.toPersistence().policy),
    };
    if (!(await this.floors.archive(id, act))) {
      throw new PriceFloorNotFoundError(command.scope.type, command.scope.id);
    }
  }
}
