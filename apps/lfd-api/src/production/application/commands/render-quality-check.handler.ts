import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { OrderCustodyReader } from "../../channels/handover/index.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import type { ProductionDay } from "../../domain/entities/production-day.js";
import { QualityCheck } from "../../domain/entities/quality-check.js";
import {
  QualityCheckReplayConflictError,
  QualityCheckWriteRaceError,
} from "../../domain/errors/quality-record-errors.js";
import {
  type HeldOrder,
  type LabelledQualityCheck,
  QualityCheckedJournalEvent,
  QualityHoldLiftedJournalEvent,
  QualityHoldRaisedJournalEvent,
} from "../../domain/events/quality-check.events.js";
import { QualityCheckReader } from "../../domain/ports/quality-check.reader.js";
import { QualityCheckRepository } from "../../domain/ports/quality-check.repository.js";
import {
  isSameQualityIntent,
  plannedLinesOf,
  type QualityCheckIntent,
  type QualityTargetRequest,
  type ScopedQualityTarget,
  scopeQualityTarget,
} from "../../domain/services/quality-check-scope.js";
import { refuseOrderOutOfHand } from "../../domain/services/order-out-of-hand.js";
import { holdTransition } from "../../domain/services/quality-holds.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { SealedDayReading } from "../services/sealed-day-reading.service.js";
import { QualityPhotoAttachment } from "../services/quality-photo-attachment.service.js";
import { RenderQualityCheckCommand } from "./render-quality-check.command.js";

/**
 * **Le verdict du superviseur** (plan `plan-controle-qualite.md`, D2, D8, D9).
 *
 * ## L'idempotence d'abord
 *
 * L'`id` vient de l'écran. Déjà écrit avec le même contenu : on rend l'`id`
 * sans rien écrire — un double clic, un réseau mobile qui rejoue. Avec un autre
 * contenu : 409. Et si deux rejeux se croisent, la base arbitre (clé primaire),
 * le perdant relit et repasse par la même comparaison.
 *
 * ## Puis la journée, la garde, les photos, et une transaction
 *
 * Une commande partie en livraison ou déjà retirée ne se juge plus
 * (`a-la-porte.md`, BQ) : le retrait le dit, avant tout dépôt de photo.
 * Lu hors verrou commun — un départ validé dans l'intervalle laisse passer le
 * verdict, la même course que celle de la retenue au comptoir (D4).
 *
 * La cible est cherchée dans la journée (compte ou plan colisé), le contrôle
 * est rendu une première fois SANS photo — une réserve sans note est refusée
 * avant de toucher le stockage —, puis les dépôts sont copiés
 * (`QualityPhotoAttachment`), et la transaction écrit le contrôle, ses photos et
 * ses faits. Un journal en panne annule le verdict. Les objets provisoires ne
 * sont retirés qu'APRÈS.
 *
 * La retenue (`hold_raised` / `hold_lifted`) se calcule sur les contrôles déjà
 * écrits de la journée et sur son plan, lus avant la transaction : deux
 * verdicts simultanés sur la même cible pourraient s'annoncer tous deux. Le
 * verdict courant, lui, reste juste — il se dérive des lignes (D2).
 */
@CommandHandler(RenderQualityCheckCommand)
export class RenderQualityCheckHandler implements ICommandHandler<
  RenderQualityCheckCommand,
  string
> {
  constructor(
    private readonly checks: QualityCheckRepository,
    private readonly recorded: QualityCheckReader,
    private readonly days: SealedDayReading,
    private readonly attachment: QualityPhotoAttachment,
    private readonly custody: OrderCustodyReader,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RenderQualityCheckCommand): Promise<string> {
    const intent = intentOf(command);
    const existing = await this.checks.load(intent.id);
    if (existing !== null) {
      return replayed(existing, intent);
    }
    // Sur une journée `packing`, « la commande est-elle colisée ? » se lit au
    // colisage (`PackedOrdersReader`, K3a).
    const day = await this.days.load(intent.serviceDay);
    const scoped = scopeQualityTarget(day, intent.target);
    await this.refuseIfGone(intent.target, scoped);
    const draft = { ...intent, target: scoped.target, checkedAt: this.clock.now() };
    QualityCheck.render({ ...draft, photos: [] });
    const photos = await this.attachment.copy(intent.uploadIds, {
      checkId: intent.id,
      serviceDay: intent.serviceDay,
      staffUserId: intent.checkedBy,
    });
    const check = QualityCheck.render({ ...draft, photos });
    try {
      await this.record({ check, label: scoped.label }, day);
    } catch (error) {
      return this.afterRace(error, intent);
    }
    await this.attachment.release(check.photos);
    return check.id;
  }

  /** Une commande partie ou retirée ne se juge plus (BQ, LB-Q1). Lue par le retrait. */
  private async refuseIfGone(
    request: QualityTargetRequest,
    scoped: ScopedQualityTarget,
  ): Promise<void> {
    if (request.kind !== "order") {
      return;
    }
    const gone = await this.custody.outOfHand([request.orderId]);
    refuseOrderOutOfHand(scoped, gone.get(request.orderId));
  }

  private async record(subject: LabelledQualityCheck, day: ProductionDay): Promise<void> {
    const previous = await this.recorded.forDay(subject.check.serviceDay);
    const transition = holdTransition(previous, subject.check, plannedLinesOf(day));
    await this.uow.run(async () => {
      await this.checks.save(subject.check);
      await this.events.publishTraced(new QualityCheckedJournalEvent(subject));
      if (transition?.kind === "raised") {
        await this.events.publishTraced(
          new QualityHoldRaisedJournalEvent(subject, heldOrdersOf(day, transition.heldOrderIds)),
        );
      } else if (transition?.kind === "lifted") {
        await this.events.publishTraced(new QualityHoldLiftedJournalEvent(subject));
      }
    });
  }

  /** La base a arbitré : si le contrôle existe désormais, c'est un rejeu. */
  private async afterRace(error: unknown, intent: QualityCheckIntent): Promise<string> {
    if (!(error instanceof QualityCheckWriteRaceError)) {
      throw error;
    }
    const winner = await this.checks.load(intent.id);
    if (winner === null) {
      throw error;
    }
    return replayed(winner, intent);
  }
}

/**
 * Les commandes retenues, sous leur référence. Toutes viennent du plan de la
 * journée (D6) ou de la cible, colisée donc au plan : la référence ne manque
 * jamais — on garde l'id plutôt que d'en inventer une si c'était le cas.
 */
function heldOrdersOf(day: ProductionDay, orderIds: readonly string[]): readonly HeldOrder[] {
  const references = new Map(day.orders.map((order) => [order.orderId, order.reference]));
  return orderIds.map((id) => ({ id, reference: references.get(id) ?? id }));
}

function intentOf(command: RenderQualityCheckCommand): QualityCheckIntent {
  return {
    id: command.id,
    serviceDay: ServiceDay.of(command.serviceDay),
    target: command.target,
    verdict: command.verdict,
    note: command.note,
    checkedBy: command.staffUserId,
    uploadIds: command.uploadIds,
  };
}

/** @throws {QualityCheckReplayConflictError} même `id`, autre contenu. */
function replayed(existing: QualityCheck, intent: QualityCheckIntent): string {
  if (!isSameQualityIntent(existing, intent)) {
    throw new QualityCheckReplayConflictError(intent.id);
  }
  return existing.id;
}
