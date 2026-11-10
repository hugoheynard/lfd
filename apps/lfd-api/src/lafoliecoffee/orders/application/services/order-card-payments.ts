import { Injectable, Logger } from "@nestjs/common";

import {
  type CardPaymentCancellation,
  type CardPaymentLine,
  CardPayments,
  CardSettlementReader,
  type RetrievedCardPayment,
} from "../../../../card-payment/channels/requests/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { OrderPaymentAwaitsAdoptionError } from "../../domain/errors/order-payment-errors.js";
import type {
  OrderCardAdoption,
  OrderCardCancellation,
  OrderCardRetrieval,
} from "../../domain/ports/order-card-payments.js";
import { OrderCardStandingReader } from "../../domain/ports/order-card-standing.reader.js";
import { orderCardSubject } from "./order-card-subject.js";

/**
 * **Les gestes du commerce sur le premier paiement d'une commande**, par les
 * ports du bloc `card-payment` (plan M2, §4.2, §4.6) — l'implémentation des
 * trois ports étroits d'`order-card-payments.ts` : l'abandon, l'expiration,
 * la clôture, l'annulation, la page de règlement, le rejeu de la passation,
 * l'exécuteur des remboursements et l'adoption.
 *
 * 🔴 **Une commande d'avant le bloc n'a pas de ligne** (§4.6) : sa position
 * est rendue vide, et c'est le commerce qui l'ADOPTE depuis ses commandes —
 * jamais depuis une lecture.
 */
@Injectable()
export class OrderCardPayments
  implements OrderCardCancellation, OrderCardRetrieval, OrderCardAdoption
{
  private readonly logger = new Logger(OrderCardPayments.name);

  constructor(
    private readonly payments: CardPayments,
    private readonly positions: CardSettlementReader,
    private readonly standings: OrderCardStandingReader,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /** Le premier paiement connu du bloc, ou `null` — lecture seule. */
  async firstOf(orderId: string): Promise<CardPaymentLine | null> {
    const [position] = await this.positions.positionOf([orderCardSubject(orderId)]);
    return position?.payments.find((line) => line.role === "first") ?? null;
  }

  /**
   * Relit chez le prestataire le premier paiement — pour le régler (la page
   * de règlement, le rejeu de la passation). 🔴 HORS transaction. Une
   * lecture n'adopte pas (§4.6) : sans ligne, le paiement est « à adopter ».
   *
   * @throws {OrderPaymentAwaitsAdoptionError} intention sans ligne de paiement.
   */
  async retrieveFirst(orderId: string): Promise<RetrievedCardPayment> {
    const first = await this.firstOf(orderId);
    if (first === null) {
      throw new OrderPaymentAwaitsAdoptionError(orderId);
    }
    return this.payments.retrieve(first.paymentId);
  }

  /**
   * Le premier paiement, **adopté** s'il manque (§4.6) — dans la transaction
   * de l'appelant, ou dans la sienne. `null` : la commande ne porte aucune
   * intention.
   */
  async ensureFirst(orderId: string): Promise<CardPaymentLine | null> {
    const known = await this.firstOf(orderId);
    if (known !== null) {
      return known;
    }
    const standing = await this.standings.ofOrder(orderId);
    if (standing?.providerRef === undefined || standing.providerRef === null) {
      return null;
    }
    const providerRef = standing.providerRef;
    await this.unitOfWork.run(() =>
      this.payments.adopt(
        orderCardSubject(orderId),
        providerRef,
        standing.firstPaymentCents,
        "first",
        standing.settled,
      ),
    );
    return this.firstOf(orderId);
  }

  /**
   * **Annule l'intention de la commande**, adoptée d'abord s'il le faut.
   * 🔴 HORS transaction. Ne lève jamais, comme `cancelIntent` d'avant le
   * bloc : un appelant qui ne doit pas être bloqué par le prestataire (la
   * clôture) n'a rien à attraper — un échec rend `unavailable` et sa raison.
   */
  async cancelFirst(orderId: string): Promise<CardPaymentCancellation> {
    try {
      const first = await this.ensureFirst(orderId);
      if (first === null) {
        return { kind: "unavailable", reason: "la commande ne porte aucune intention" };
      }
      return await this.payments.cancel(first.paymentId);
    } catch (error) {
      this.logger.error(
        `Intention de la commande ${orderId} non annulée.`,
        error instanceof Error ? error.stack : String(error),
      );
      return {
        kind: "unavailable",
        reason: error instanceof Error ? error.message : "erreur inconnue",
      };
    }
  }
}
