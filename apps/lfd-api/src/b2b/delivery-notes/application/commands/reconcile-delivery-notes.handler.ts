import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrdersToReconcileDeliveryNotes } from "../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { AppError } from "../../../../platform/shared/errors/app-error.js";
import type { DeliveryNote } from "../../domain/entities/delivery-note.js";
import { DeliveryNoteRepository } from "../../domain/ports/delivery-note.repository.js";
import { alignmentOf, type FollowedOrder } from "../../domain/services/delivery-note-alignment.js";
import {
  termsGapsOf,
  type DeliveryNoteTermsGap,
} from "../../domain/services/delivery-note-terms-control.js";
import { DeliveryNoteAligner, type AlignedOutcome } from "../services/delivery-note-aligner.js";
import {
  RECONCILE_PAGE_SIZE,
  RECONCILE_REPAIR_LIMIT,
  ReconcileDeliveryNotesCommand,
  type DeliveryNoteReconciliationReport,
  type UnrepairedOrder,
} from "./reconcile-delivery-notes.command.js";

/**
 * La décision sans verrou, sur des BL jetables : elle ne sert qu'à trier. Un
 * refus du domaine part en réparation, où l'aligneur le compte.
 */
function previewOf(
  order: FollowedOrder,
  notes: readonly DeliveryNote[],
  now: Date,
): AlignedOutcome | { readonly change: "repair" } {
  const own = notes.filter((note) => note.orderId === order.orderId);
  try {
    const alignment = alignmentOf(order, own, { newId: () => "preview", now });
    return alignment.change === "none" || alignment.change === "unrepairable"
      ? alignment
      : { change: "repair" };
  } catch (error) {
    if (error instanceof AppError) {
      return { change: "repair" };
    }
    throw error;
  }
}

/** Le compte d'un passage, tenu au fil des commandes. */
class Tally {
  scanned = 0;
  created = 0;
  advanced = 0;
  voided = 0;
  completed = 0;
  failed = 0;
  complete = true;
  compared = 0;
  readonly unrepaired: UnrepairedOrder[] = [];
  readonly gaps: DeliveryNoteTermsGap[] = [];

  get repairs(): number {
    return this.created + this.advanced + this.voided + this.completed + this.failed;
  }

  /** Le contrôle des totaux d'une commande dont le BL est déjà juste (plan E4a, § 2). */
  control(order: FollowedOrder, notes: readonly DeliveryNote[]): void {
    if (order.status === "cancelled" || order.status === "placed" || order.lines.length === 0) {
      return;
    }
    this.compared += 1;
    this.gaps.push(...termsGapsOf(order, notes));
  }

  record(order: FollowedOrder, outcome: AlignedOutcome): void {
    switch (outcome.change) {
      case "created":
        this.created += 1;
        return;
      case "advanced":
        this.advanced += 1;
        return;
      case "voided":
        this.voided += 1;
        return;
      case "completed":
        this.completed += 1;
        return;
      case "unrepairable":
        this.unrepaired.push({
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          reason: outcome.reason,
        });
        return;
      default:
        return;
    }
  }

  report(): DeliveryNoteReconciliationReport {
    const { scanned, created, advanced, voided, completed, failed, unrepaired, complete } = this;
    const terms = { compared: this.compared, gaps: [...this.gaps] };
    return { scanned, created, advanced, voided, completed, failed, unrepaired, complete, terms };
  }
}

/**
 * Parcourt les commandes par pages, décide SANS verrou ce qui est à faire
 * (la plupart du temps : rien), puis répare chaque commande en écart dans SA
 * propre unité de travail, sous le verrou de la commande, en refaisant la
 * décision sur l'état relu (plan E2, § 8.2 et § 8.3). Idempotent : une
 * commande juste n'est ni verrouillée ni réécrite.
 *
 * Les écarts non réparables sont comptés, nommés et journalisés à chaque
 * passage, jamais réparés en silence. Un échec technique sur une commande ne
 * prive pas les suivantes de leur tour.
 */
@CommandHandler(ReconcileDeliveryNotesCommand)
export class ReconcileDeliveryNotesHandler implements ICommandHandler<
  ReconcileDeliveryNotesCommand,
  DeliveryNoteReconciliationReport
> {
  private readonly logger = new Logger(ReconcileDeliveryNotesHandler.name);

  constructor(
    private readonly orders: OrdersToReconcileDeliveryNotes,
    private readonly notes: DeliveryNoteRepository,
    private readonly aligner: DeliveryNoteAligner,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<DeliveryNoteReconciliationReport> {
    const tally = new Tally();
    const now = this.clock.now();
    let afterId: string | null = null;
    while (tally.complete) {
      const page = await this.orders.pageAfter(afterId, RECONCILE_PAGE_SIZE);
      if (page.length === 0) {
        break;
      }
      await this.reconcilePage(page, now, tally);
      afterId = page[page.length - 1]?.orderId ?? null;
    }
    this.logReport(tally.report());
    return tally.report();
  }

  private async reconcilePage(
    page: readonly FollowedOrder[],
    now: Date,
    tally: Tally,
  ): Promise<void> {
    const notes = await this.notes.loadForOrders(page.map((order) => order.orderId));
    for (const order of page) {
      tally.scanned += 1;
      const preview = previewOf(order, notes, now);
      if (preview.change === "none") {
        tally.control(order, notes);
        continue;
      }
      if (preview.change === "unrepairable") {
        // Rien à écrire : compté sans verrou ni transaction.
        tally.record(order, preview);
        continue;
      }
      if (tally.repairs >= RECONCILE_REPAIR_LIMIT) {
        tally.complete = false;
        return;
      }
      await this.repair(order, now, tally);
    }
  }

  private async repair(order: FollowedOrder, now: Date, tally: Tally): Promise<void> {
    try {
      const outcome = await this.uow.run(async () => {
        const locked = await this.orders.lockProgressOf(order.orderId);
        return locked === null ? null : await this.aligner.align(locked, now);
      });
      if (outcome !== null) {
        tally.record(order, outcome);
      }
    } catch (error) {
      tally.failed += 1;
      this.logger.error(
        `BL non réconcilié (commande ${order.orderNumber}, ${order.orderId})`,
        error,
      );
    }
  }

  private logReport(report: DeliveryNoteReconciliationReport): void {
    for (const order of report.unrepaired) {
      this.logger.warn(
        `Bon de livraison non aligné sur la commande ${order.orderNumber} (${order.orderId}) : ` +
          `${order.reason}. Rien n'a été inventé ; à reprendre à la main.`,
      );
    }
    for (const gap of report.terms.gaps) {
      this.logger.warn(
        `Totaux du bon de livraison ${gap.noteNumber} différents de la commande ${gap.orderNumber} ` +
          `(${gap.orderId}) : ${gap.fields.join(", ")}. Rien n'a été réécrit ; à examiner avant E4b.`,
      );
    }
  }
}
