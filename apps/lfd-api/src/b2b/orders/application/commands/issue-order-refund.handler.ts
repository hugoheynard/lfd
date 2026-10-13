import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { WallClock } from "../../../../platform/time/wall-clock.js";
import {
  PaymentRefunder,
  type RefundIssuance,
  type RefundRequestParams,
} from "../../../payments/domain/payment-refunder.js";
import {
  refundRequestStateOf,
  type OrderRefundRequest,
} from "../../domain/entities/order-refund-request.js";
import { OrderRefundRequestLease } from "../../domain/ports/order-refund-request.lease.js";
import { OrderRefundRequestReader } from "../../domain/ports/order-refund-request.reader.js";
import { OrderRefundRequestRepository } from "../../domain/ports/order-refund-request.repository.js";
import { OrderRefundRepository } from "../../domain/ports/order-refund.repository.js";
import { RefundAttentionBell } from "../services/refund-attention-bell.js";
import { RefundIssuanceRecorder } from "../services/refund-issuance-recorder.js";
import { IssueOrderRefundCommand } from "./issue-order-refund.command.js";

/**
 * Le bail : plus long que l'appel le plus long — recherche puis création,
 * chacune 3 × 20 s au pire, attentes du SDK comprises : moins de 3 min (C4.7).
 */
export const REFUND_LEASE_MS = 5 * 60 * 1000;

/** Le motif écrit quand la commande n'a pas d'intention : rien à rembourser chez Stripe. */
const NO_INTENT = "no_payment_intent";

/**
 * **L'exécuteur des remboursements** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.7).
 *
 * 🔴 Jamais dans une transaction ni dans un abonné durable : Stripe y serait
 * appelé sous transaction, et une levée effacerait l'essai, la cloche et le
 * journal de l'échec (`vitruve`, BLOQUANT 1). Trois temps :
 *
 * 1. prendre le bail (écriture validée seule, à l'horloge MURALE), puis lire
 *    l'état sous le verrou `orders` : rien à faire si remboursé ou émis ;
 *    génération suivante si le `re_…` courant a échoué ;
 * 2. hors de toute transaction : chercher, puis créer, chez Stripe ;
 * 3. une transaction courte écrit l'issue (`RefundIssuanceRecorder`).
 *
 * Un `COMMIT` du 3. qui échoue après un `re_…` créé : le bail expire,
 * l'exécuteur suivant retrouve le `re_…` par la recherche — jamais un second.
 */
@CommandHandler(IssueOrderRefundCommand)
export class IssueOrderRefundHandler implements ICommandHandler<IssueOrderRefundCommand, void> {
  private readonly logger = new Logger(IssueOrderRefundHandler.name);

  constructor(
    private readonly lease: OrderRefundRequestLease,
    private readonly requests: OrderRefundRequestRepository,
    private readonly reader: OrderRefundRequestReader,
    private readonly ledgers: OrderRefundRepository,
    private readonly refunder: PaymentRefunder,
    private readonly recorder: RefundIssuanceRecorder,
    private readonly bell: RefundAttentionBell,
    private readonly events: DomainEventPublisher,
    private readonly unitOfWork: UnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly wall: WallClock,
  ) {}

  async execute(command: IssueOrderRefundCommand): Promise<void> {
    const token = this.ids.next();
    const wallNow = this.wall.elapsedNow();
    const until = new Date(wallNow.getTime() + REFUND_LEASE_MS);
    if (!(await this.lease.claim(command.orderId, token, until, wallNow))) {
      return;
    }
    const params = await this.prepare(command.orderId, token);
    if (params === null) {
      return;
    }
    const issuance = await this.callStripe(params);
    const rejected = await this.recorder.record({
      orderId: command.orderId,
      token,
      generation: params.generation,
      issuance,
    });
    if (rejected !== null) {
      this.events.publish(rejected);
    }
  }

  /**
   * Sous le verrou `orders` : l'état de la demande, lu au carnet. Rend les
   * paramètres de l'appel, ou `null` quand il n'y a rien à faire (bail relâché).
   */
  private prepare(orderId: string, token: string): Promise<RefundRequestParams | null> {
    return this.unitOfWork.run(async () => {
      const ledger = await this.ledgers.loadByOrder(orderId);
      const request = await this.requests.load(orderId);
      if (ledger === null || request === null || !request.isHeldBy(token)) {
        return null;
      }
      const state = refundRequestStateOf(request, ledger.view());
      const intent = await this.reader.paymentIntentOf(orderId);
      if (state === "refunded" || state === "issued" || intent === null) {
        await this.standDown(request, ledger.orderNumber, state === "to_issue");
        return null;
      }
      if (state === "failed") {
        request.reopenAfterFailure(ledger.statusOf(request.stripeRefundId ?? ""));
        // Le bail reste à nous : l'étape 3 relit la demande sous la génération neuve.
        await this.requests.save(request);
      }
      return {
        paymentIntentId: intent,
        key: request.key(),
        requestId: orderId,
        generation: request.generation,
      };
    });
  }

  /**
   * Rien à appeler : déjà rendu, déjà émis — ou, sur une demande à émettre,
   * pas d'intention à rembourser (impossible sur une commande payée par
   * carte ; tracé plutôt que tu). Le bail est relâché.
   */
  private async standDown(
    request: OrderRefundRequest,
    orderNumber: string,
    withoutIntent: boolean,
  ): Promise<void> {
    if (withoutIntent) {
      request.stopped(this.clock.now(), NO_INTENT);
      await this.bell.ring({
        orderId: request.orderId,
        orderNumber,
        generation: request.generation,
        announcedCents: request.announcedCents,
        cause: "declined",
      });
    }
    request.release();
    await this.requests.save(request);
  }

  /**
   * Stripe, hors transaction. `nothing_left` relance la RECHERCHE (C4.7) :
   * un `re_…` de la génération trouvé vaut émission.
   */
  private async callStripe(params: RefundRequestParams): Promise<RefundIssuance> {
    const issuance = await this.refunder.refundRemainder(params);
    if (issuance.kind === "unavailable") {
      this.logger.warn(
        `Remboursement non émis (commande ${params.requestId}) : ${issuance.reason}`,
      );
    }
    if (issuance.kind !== "nothing_left") {
      return issuance;
    }
    const lookup = await this.refunder.findRefund(params);
    return lookup.kind === "found" ? { kind: "issued", refund: lookup.refund } : issuance;
  }
}
