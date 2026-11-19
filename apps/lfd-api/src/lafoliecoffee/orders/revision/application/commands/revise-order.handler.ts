import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../../platform/id/id-generator.js";
import { Clock } from "../../../../../platform/time/clock.js";
import type { OrderRevisionToSave, RevisableOrder } from "../../domain/entities/order-revision.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  OrderRevisedElsewhereError,
  QuantitiesOnlyAfterArrestError,
} from "../../domain/errors/order-revision-errors.js";
import { OrderRevisionRepository } from "../../domain/ports/order-revision.repository.js";
import { ItemLimitOverrideRecorder } from "../../../domain/ports/item-limit-override.recorder.js";
import {
  itemLimitOverridesOf,
  justifyItemLimitOverrides,
} from "../../../domain/services/item-limit-overrides.js";
import { ensureTotalSeen } from "../../../domain/services/seen-total.js";
import {
  isQuantitiesOnly,
  type RevisionScope,
} from "../../domain/services/revision-after-arrest.js";
import { type ComposedRevision, OrderRevising } from "../services/order-revising.service.js";
import { OrderRevisionRecording } from "../services/order-revision-recording.js";
import { RevisionCardRefund } from "../services/revision-card-refund.js";
import { RevisionWall } from "../services/revision-wall.js";
import { ReviseOrderCommand, type ReviseOrderResult } from "./revise-order.command.js";

/**
 * **Modifier une commande** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification »).
 *
 * ## L'ordre des gestes
 *
 * 1. Hors verrou : le mur, la révision attendue (R7), la règle (R1), puis la
 *    recomposition entière ({@link OrderRevising}), puis le total vu (doc
 *    `modifier-une-commande.md`, §2.3 (R14) — après les refus de règlement, R15) — tous
 *    les refus avant toute écriture, aucun appel d'un autre bloc sous un verrou.
 * 2. La transaction : ligne `orders` verrouillée et relue, révision et règle
 *    rejugées sous le verrou, puis l'écriture ({@link OrderRevisionRecording},
 *    partagée avec la hausse payée, plan S2 §2.6) : le guichet du fournil sous le verrou de
 *    chaque journée touchée (§ 2.8 — « inscrite » refuse et annule tout), la
 *    journée nouvelle tenue ouverte, l'écriture conditionnée, la ligne
 *    d'encaissement recalée (au compte), et les deux faits durables.
 *
 * ## La limite d'un produit passée par l'équipe (plan
 * `documentation/limites-de-commande/passer-outre-la-limite-d-un-produit.md`, § 3.6)
 *
 * Une ligne ajoutée ou augmentée que l'équipe fait passer outre sa limite
 * exige un motif, refusé hors verrou ; chaque dépassement est consigné
 * (`origin = revision`) dans la transaction qui écrit la révision.
 *
 * ## Une carte encaissée (plan
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.12)
 *
 * M1 fait la baisse (rendue sur la carte) et le total égal ; la hausse passe
 * par un complément. L'ordre, nommé (R5) : hors verrou, aucun projet de
 * hausse vivant ; sous le verrou et AVANT toute écriture, le projet rejugé,
 * les restes lus et la répartition calculée ({@link RevisionCardRefund}) ;
 * PUIS l'écriture ; PUIS une demande de remboursement par paiement touché,
 * dans la même transaction. Le montant vient du règlement que la
 * composition remonte, jamais d'un calcul ici.
 *
 * ## Une commande prise sur la vitrine (plan du jour J, §13, lot L5)
 *
 * Ni guichet du fournil, ni suivi du BL : l'ordre est la ligne `orders`,
 * puis le verrou du stock, et le reste y est rejugé sur les hausses.
 *
 * ## Après l'arrêt du plan (plan A2, § 7)
 *
 * L'équipe d'une commande au compte change encore les QUANTITÉS : la portée
 * `quantities` (statut déjà inscrit) refuse tôt tout autre changement, et
 * les ateliers ({@link OrderWorkshopRevision}) révisent le fournil puis le
 * colisage sous leurs verrous. Le BL prévu suit, après l'écriture de la
 * commande : `orders` → journée → feuille → BL.
 */
@CommandHandler(ReviseOrderCommand)
export class ReviseOrderHandler implements ICommandHandler<ReviseOrderCommand, ReviseOrderResult> {
  constructor(
    private readonly wall: RevisionWall,
    private readonly revising: OrderRevising,
    private readonly revisions: OrderRevisionRepository,
    private readonly recording: OrderRevisionRecording,
    private readonly cardRefund: RevisionCardRefund,
    private readonly overrides: ItemLimitOverrideRecorder,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: ReviseOrderCommand): Promise<ReviseOrderResult> {
    const current = await this.wall.find(command.orderId, command.actor);
    ensureExpected(current, command.expectedRevision);
    const scope = await this.revising.ensureRevisable(current, command.actor.kind, "revise");
    const recomposed = await this.revising.compose(current, command.content, command.actor, {
      requireChange: true,
      // M1 juge à l'horloge (plan S2, R6).
      decidedAt: this.clock.now(),
      exceedItemLimits: command.itemLimits.exceedItemLimits,
    });
    const { revision } = recomposed;
    const reason = justifyItemLimitOverrides(
      recomposed.exceeded,
      command.itemLimits.overrideReason,
      revision.state.lines,
    );
    ensureWithinScope(current, revision, scope);
    // R14, R15 (plan S2) : le règlement a parlé (ensureRevisable, compose) ;
    // on ne fait pas revalider un montant qu'on refuserait de toute façon.
    ensureTotalSeen(revision.totalAfterCents, command.expectedTotalCents);
    await this.cardRefund.ensureNoLiveIncrease(current);
    await this.unitOfWork.run(() => this.record(command, recomposed, reason));
    return {
      id: revision.orderId,
      revision: revision.toRevision,
      totalCents: revision.totalAfterCents,
      previousTotalCents: revision.totalBeforeCents,
      pretaxCents: revision.pretaxAfterCents,
      previousPretaxCents: revision.pretaxBeforeCents,
      onAccount: revision.onAccount,
      forCompany: current.companyId !== null,
    };
  }

  private async record(
    command: ReviseOrderCommand,
    { revision, settlement, exceeded }: ComposedRevision,
    reason: string | null,
  ): Promise<void> {
    const locked = await this.revisions.lock(command.orderId);
    if (locked === null) {
      throw new OrderNotFoundError(command.orderId);
    }
    ensureExpected(locked, command.expectedRevision);
    ensureWithinScope(
      locked,
      revision,
      await this.revising.ensureRevisable(locked, command.actor.kind, "revise"),
    );
    const parts = await this.cardRefund.prepare(locked, settlement, command.actor.kind);
    await this.recording.record(locked, revision, command.actor, command.origin);
    await this.recordOverrides(command, revision, exceeded, reason);
    await this.cardRefund.request(parts, command.actor);
  }

  /** Les dépassements de l'équipe, une trace par SKU, dans la transaction de la révision. */
  private async recordOverrides(
    command: ReviseOrderCommand,
    revision: OrderRevisionToSave,
    exceeded: ComposedRevision["exceeded"],
    reason: string | null,
  ): Promise<void> {
    const { actor } = command;
    if (reason === null || actor.kind !== "staff" || revision.serviceDay === null) {
      return;
    }
    await this.overrides.record(
      itemLimitOverridesOf({
        exceeded,
        orderId: revision.orderId,
        staffUserId: actor.staffId,
        reason,
        serviceDay: revision.serviceDay,
        origin: "revision",
        at: this.clock.now(),
        nextId: () => this.ids.next(),
      }),
    );
  }
}

/**
 * Plan A2, § 7 : une commande que son statut dit déjà inscrite ne change que
 * des quantités. Le guichet du fournil le rejuge sous le verrou de la journée.
 *
 * @throws {QuantitiesOnlyAfterArrestError}
 */
function ensureWithinScope(
  order: RevisableOrder,
  revision: OrderRevisionToSave,
  scope: RevisionScope,
): void {
  if (scope === "quantities" && !isQuantitiesOnly(order.lines, revision)) {
    throw new QuantitiesOnlyAfterArrestError(order.orderId);
  }
}

/** R7 : la modification porte la révision qu'elle corrige. */
function ensureExpected(order: RevisableOrder, expectedRevision: number): void {
  if (order.revision !== expectedRevision) {
    throw new OrderRevisedElsewhereError(order.orderId, expectedRevision);
  }
}
