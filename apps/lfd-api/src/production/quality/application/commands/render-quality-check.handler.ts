import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { OrderCustodyReader } from "../../../channels/handover/index.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { ProductionDay } from "../../../day/index.js";
import { type QualityPhotoRef, QualityCheck } from "../../domain/entities/quality-check.js";
import { QualityControlSettings } from "../../domain/entities/quality-control-settings.js";
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
import { ProductionDayLock } from "../../../day/index.js";
import { QualityCheckReader } from "../../domain/ports/quality-check.reader.js";
import { QualityCheckRepository } from "../../domain/ports/quality-check.repository.js";
import { QualityControlSettingsReader } from "../../domain/ports/quality-control-settings.reader.js";
import {
  isSameQualityIntent,
  plannedLinesOf,
  type QualityCheckIntent,
  type QualityTargetRequest,
  type ScopedQualityTarget,
  scopeQualityTarget,
} from "../../domain/services/quality-check-scope.js";
import { refuseOrderOutOfHand } from "../../domain/services/refuse-order-out-of-hand.js";
import { holdTransition } from "../../domain/services/quality-holds.js";
import { ServiceDay } from "../../../day/index.js";
import { SealedDayReading } from "../services/sealed-day-reading.service.js";
import { QualityPhotoAttachment } from "../services/quality-photo-attachment.service.js";
import { RenderQualityCheckCommand } from "./render-quality-check.command.js";

/**
 * **Le verdict du superviseur** (plan `le-controle-qualite.md`, D2, D8, D9).
 *
 * ## L'idempotence d'abord
 *
 * L'`id` vient de l'écran. Déjà écrit avec le même contenu : on rend l'`id`
 * sans rien écrire — un double clic, un réseau mobile qui rejoue. Avec un autre
 * contenu : 409. Et si deux rejeux se croisent, la base arbitre (clé primaire),
 * le perdant relit et repasse par la même comparaison.
 *
 * ## Puis le réglage
 *
 * Un niveau désactivé dans Réglages › Commandes (2026-10-26) refuse le verdict
 * (409) — après l'idempotence : un rejeu d'un verdict écrit AVANT la
 * désactivation rend toujours son `id`, il n'écrit rien de neuf.
 *
 * ## Puis une première lecture, les photos, et la décision sous verrou
 *
 * Une commande partie en livraison ou déjà retirée ne se juge plus
 * (`a-la-porte.md`, BQ). Une première lecture — la journée, la garde, le
 * contrôle rendu SANS photo — refuse tôt, avant de toucher le stockage ; puis
 * les dépôts sont copiés (`QualityPhotoAttachment`), HORS transaction : c'est
 * un appel au stockage.
 *
 * La décision se prend ensuite dans l'unité de travail, sous le verrou
 * EXCLUSIF de la journée (`ProductionDayLock`), comme les fournées : la
 * journée est relue, la cible rescopée, la garde « partie » refaite, et la
 * retenue (`hold_raised` / `hold_lifted`) calculée sur les contrôles écrits —
 * deux verdicts simultanés sur la même journée s'attendent, et un seul annonce
 * la retenue. Le départ d'une tournée prend la même clé en mode partagé
 * (`ArrestedPlanHold`, vérifié le 2026-11-15 dans
 * `delivery-departure-support.ts`) : un départ validé pendant que le verdict
 * attend son verrou est vu à la relecture, et le verdict est refusé. Le
 * retrait au comptoir ne prend pas cette clé : il reste la course de la
 * retenue au comptoir (D4).
 *
 * Ordre des verrous : la journée seule. Aucun verrou de commande n'est pris
 * ici ni tenu par l'appelant (le contrôleur, par le bus) ; les lectures du
 * retrait et du colisage faites sous le verrou sont des lectures en base, sans
 * réseau. Un journal en panne annule le verdict ; les objets provisoires ne
 * sont retirés qu'APRÈS. Un refus sous le verrou laisse les copies orphelines,
 * comme un journal en panne.
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
    private readonly settings: QualityControlSettingsReader,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly lock: ProductionDayLock,
  ) {}

  async execute(command: RenderQualityCheckCommand): Promise<string> {
    const intent = intentOf(command);
    const existing = await this.checks.load(intent.id);
    if (existing !== null) {
      return replayed(existing, intent);
    }
    const settings = (await this.settings.current()) ?? QualityControlSettings.defaults();
    settings.assertCanCheck(intent.target.kind);
    // Sur une journée `packing`, « la commande est-elle colisée ? » se lit au
    // colisage (`PackedOrdersReader`, K3a). Première lecture : refuser tôt.
    const checkedAt = this.clock.now();
    const glimpse = await this.judge(intent, checkedAt, []);
    const photos = await this.attachment.copy(intent.uploadIds, {
      checkId: intent.id,
      serviceDay: intent.serviceDay,
      staffUserId: intent.checkedBy,
    });
    try {
      await this.uow.run(async () => {
        await this.lock.lock(intent.serviceDay);
        const decided = await this.judge(intent, checkedAt, photos);
        await this.record(decided);
      });
    } catch (error) {
      return this.afterRace(error, intent);
    }
    await this.attachment.release(photos);
    return glimpse.subject.check.id;
  }

  /** Lit la journée, rescope la cible, refait la garde, rend le contrôle. */
  private async judge(
    intent: QualityCheckIntent,
    checkedAt: Date,
    photos: readonly QualityPhotoRef[],
  ): Promise<Judged> {
    const day = await this.days.load(intent.serviceDay);
    const scoped = scopeQualityTarget(day, intent.target);
    await this.refuseIfGone(intent.target, scoped);
    const check = QualityCheck.render({ ...intent, target: scoped.target, checkedAt, photos });
    return { subject: { check, label: scoped.label }, day };
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

  /** Sous le verrou de la journée : la retenue se calcule sur ce qui est écrit. */
  private async record({ subject, day }: Judged): Promise<void> {
    const previous = await this.recorded.forDay(subject.check.serviceDay);
    const transition = holdTransition(previous, subject.check, plannedLinesOf(day));
    await this.checks.save(subject.check);
    await this.events.publishTraced(new QualityCheckedJournalEvent(subject));
    if (transition?.kind === "raised") {
      await this.events.publishTraced(
        new QualityHoldRaisedJournalEvent(subject, heldOrdersOf(day, transition.heldOrderIds)),
      );
    } else if (transition?.kind === "lifted") {
      await this.events.publishTraced(new QualityHoldLiftedJournalEvent(subject));
    }
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
/** Le contrôle rendu et la journée qui l'a jugé. */
interface Judged {
  readonly subject: LabelledQualityCheck;
  readonly day: ProductionDay;
}

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
