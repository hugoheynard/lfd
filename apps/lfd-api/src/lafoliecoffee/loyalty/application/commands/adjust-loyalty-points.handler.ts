import { createHash } from "node:crypto";

import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { LoyaltyPointsAdjustedEvent } from "../../domain/events/loyalty.events.js";
import { LoyaltyAccountRepository } from "../../domain/ports/loyalty-account.repository.js";
import { LoyaltyHolderDirectory } from "../../domain/ports/loyalty-holder.directory.js";
import { LoyaltyHolder } from "../../domain/value-objects/loyalty-holder.js";
import { LoyaltyReason } from "../../domain/value-objects/loyalty-reason.js";
import { AdjustLoyaltyPointsCommand } from "./adjust-loyalty-points.command.js";
import { requireNamedHolder } from "./loyalty-holder-support.js";

/**
 * Ajuste le livre d'un titulaire, avec un motif. Sous le même verrou que la
 * conversion : un retrait concurrent d'une conversion ne peut pas, à eux deux,
 * faire passer le solde sous zéro.
 *
 * **Une fois par intention** : un ajustement est un mouvement RELATIF, donc un
 * rejeu le referait. La clé de l'écran est réclamée avant tout et scellée dans
 * la transaction du mouvement ; un second envoi de même clé ne réécrit rien.
 * Le sujet est le titulaire, les points et le motif : la même clé sur un autre
 * ajustement est refusée (409). Une version de solde attendue (comme la
 * conversion) aurait aussi refusé l'ajustement quand un crédit automatique
 * — commande, bienvenue — passe entre la lecture de l'écran et le clic.
 *
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour un autre ajustement.
 */
@CommandHandler(AdjustLoyaltyPointsCommand)
export class AdjustLoyaltyPointsHandler implements ICommandHandler<
  AdjustLoyaltyPointsCommand,
  void
> {
  constructor(
    private readonly accounts: LoyaltyAccountRepository,
    private readonly holders: LoyaltyHolderDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: AdjustLoyaltyPointsCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: ADJUST_GESTURE,
        subject: adjustmentSubject(command),
      },
      NOTHING_TO_REPLAY,
      (seal) => this.adjust(command, seal),
    );
  }

  private async adjust(
    command: AdjustLoyaltyPointsCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    const holder = LoyaltyHolder.of(command.holderKind, command.holderId);
    const reason = LoyaltyReason.of(command.reason);
    const named = await requireNamedHolder(this.holders, holder);
    await this.uow.run(async () => {
      const account = await this.accounts.loadLocked(holder);
      account.adjust(command.points, {
        entryId: this.ids.next(),
        staffUserId: command.staffUserId,
        reason,
        at: this.clock.now(),
      });
      await this.accounts.save(account);
      await this.events.publishTraced(
        new LoyaltyPointsAdjustedEvent(named, command.points, reason.text, null),
      );
      await seal();
    });
  }
}

/** Le nom stable du geste, dans le registre des intentions. */
const ADJUST_GESTURE = "loyalty.adjust-points";

/** Ce que vise l'ajustement — identifiants et nombre, le motif haché (borne de la colonne). */
function adjustmentSubject(command: AdjustLoyaltyPointsCommand): string {
  const reason = createHash("sha256").update(command.reason.trim()).digest("hex");
  return [command.holderKind, command.holderId, String(command.points), reason].join("|");
}
