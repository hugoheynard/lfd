import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { PricingFloor, floorSubjectKey } from "../../domain/entities/pricing-floor.js";
import { PricingFloorRepository } from "../../domain/ports/pricing-floor.repository.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { referenceCanonicalFor } from "../floor-reference.js";
import { Clock } from "../../../../platform/time/clock.js";
import { describeFloor, describeScope } from "../../domain/pricing-act.js";
import { scopeNameOf } from "../scope-names.js";
import { SetPriceFloorCommand } from "./set-price-floor.command.js";
import type { PricingActKind } from "../../domain/pricing-act.js";

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
    const existing = await this.floors.inForceFor(command.scope, command.clientele, now);
    await this.pose(command, existing === null ? "posed" : "replaced", now);
  }

  private async pose(command: SetPriceFloorCommand, kind: PricingActKind, at: Date): Promise<void> {
    const { scope, clientele, policy, staffUserId } = command;
    const floor = PricingFloor.pose(
      this.ids.next(),
      scope,
      clientele,
      policy,
      staffUserId,
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
      // Préfixée pour une limite publique, inchangée pour la pro : cf.
      // `floorSubjectKey`.
      subjectId: floorSubjectKey(scope, clientele),
      kind,
      actor: staffUserId,
      at,
      reason: null,
      summary: describeFloor(clientele, policy),
      // Le sujet d'une limite est sa PORTÉE : c'est elle qu'on nomme.
      subjectLabel: describeScope(scope, await scopeNameOf(scope, this.catalog)),
    });
  }
}
