import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PublicSettingsEdgeCache } from "../../../shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";
import { PromotionRepository } from "../../domain/ports/promotion.repository.js";
import { promotionActOf } from "../../domain/promotion-act.js";
import { Promotion } from "../../domain/promotion.js";
import { PosePromotionCommand } from "./pose-promotion.command.js";
import { PromotionFulfillmentNames } from "./promotion-fulfillment-names.js";
import { PromotionWriteGuard } from "./promotion-write-guard.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";

/** Le nom stable du geste, dans le registre des intentions. */
const POSE_GESTURE = "promotions.pose";

/** Rend l'identifiant de la promotion posée ; le client relit ensuite. */
@CommandHandler(PosePromotionCommand)
export class PosePromotionHandler implements ICommandHandler<PosePromotionCommand, string> {
  constructor(
    private readonly promotions: PromotionRepository,
    private readonly guard: PromotionWriteGuard,
    private readonly names: PromotionFulfillmentNames,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly afterCommit: AfterCommit,
    private readonly edge: PublicSettingsEdgeCache,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * **Une fois par intention** : la clé de l'écran est réclamée avant tout et
   * scellée dans la transaction de l'écriture ; un double clic rend ce qui a
   * déjà été posé, sans rien poser une seconde fois. Le sujet est l'empreinte
   * de la saisie : la même clé sur une autre saisie est refusée (409).
   *
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a servi pour une autre saisie.
   */
  execute(command: PosePromotionCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: POSE_GESTURE,
        subject: intentSubject("promotion", command.terms),
      },
      CREATED_ID_REPLAY,
      (seal) => this.pose(command, seal),
    );
  }

  private async pose(
    command: PosePromotionCommand,
    seal: (id: string) => Promise<void>,
  ): Promise<string> {
    const now = this.clock.now();
    const promotion = Promotion.pose(this.ids.next(), command.terms, command.staffUserId, now);
    const names = await this.names.required(promotion.terms.fulfillment);
    await this.guard.admitsPlace(promotion);
    await this.uow.run(async () => {
      await this.promotions.save(
        promotion,
        promotionActOf(promotion, "posed", command.staffUserId, now, command.terms.reason, names),
      );
      this.afterCommit.defer(() => this.edge.purge(), "promotion.posed.edge-purge");
      await seal(promotion.id);
    });
    return promotion.id;
  }
}
