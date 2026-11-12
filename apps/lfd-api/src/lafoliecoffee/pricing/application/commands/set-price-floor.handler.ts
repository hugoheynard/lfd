import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { PricingFloor, floorSubjectKey } from "../../domain/entities/pricing-floor.js";
import { PricingFloorRepository } from "../../domain/ports/pricing-floor.repository.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { referenceCanonicalFor } from "../floor-reference.js";
import { Clock } from "../../../../platform/time/clock.js";
import { describeFloor, describeScope } from "../../domain/pricing-act.js";
import { scopeNameOf } from "../scope-names.js";
import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { saleReferenceOf } from "../../domain/services/sale-references.js";
import { assertOnSale } from "./sale-reference-support.js";
import { SetPriceFloorCommand } from "./set-price-floor.command.js";
import type { PricingAct, PricingActKind } from "../../domain/pricing-act.js";
import { staffViewer } from "../../../catalog/domain/catalog-viewer.js";

/** Le nom stable du geste, dans le registre des intentions. */
const SET_FLOOR_GESTURE = "pricing.set-price-floor";

/**
 * **Poser une limite de prix** (un plancher), une fois par intention : poser
 * ouvre une version neuve de la limite et écrit un acte — rejoué, le geste en
 * ouvrirait une seconde, et « remplacée » mentirait. La clé de l'écran est
 * scellée dans la transaction de la pose ; un double clic ne repose rien.
 *
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour une autre limite.
 */
@CommandHandler(SetPriceFloorCommand)
export class SetPriceFloorHandler implements ICommandHandler<SetPriceFloorCommand, void> {
  constructor(
    private readonly floors: PricingFloorRepository,
    private readonly catalog: ProductCatalogReader,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly references: SaleReferenceReader,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
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
  execute(command: SetPriceFloorCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: SET_FLOOR_GESTURE,
        subject: intentSubject(
          `${command.scope.type}:${command.scope.id ?? ""}`,
          command.clientele,
          command.policy,
        ),
      },
      NOTHING_TO_REPLAY,
      (seal) => this.set(command, seal),
    );
  }

  private async set(
    command: SetPriceFloorCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    // Un plancher sur une référence hors vente ne protégerait rien (L5).
    await assertOnSale(this.references, [saleReferenceOf(command.scope)], command.clientele);
    const now = this.clock.now();
    const existing = await this.floors.inForceFor(command.scope, command.clientele, now);
    await this.pose(command, existing === null ? "posed" : "replaced", now, seal);
  }

  private async pose(
    command: SetPriceFloorCommand,
    kind: PricingActKind,
    at: Date,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    const { scope, clientele, policy, staffUserId } = command;
    const floor = PricingFloor.pose(
      this.ids.next(),
      scope,
      clientele,
      policy,
      staffUserId,
      at,
      referenceCanonicalFor(scope, await this.catalog.all(staffViewer("pro"))),
    );
    const act: PricingAct = {
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
    };
    await this.uow.run(async () => {
      await this.floors.pose(floor, act);
      await seal();
    });
  }
}
