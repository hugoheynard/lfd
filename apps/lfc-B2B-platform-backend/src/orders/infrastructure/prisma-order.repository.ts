import { Injectable } from "@nestjs/common";

import { OrderStatus, PaymentStatus, Prisma } from "../../infra/database/client/client.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import { IdGenerator } from "../../infra/id/id-generator.js";
import { SecretGenerator } from "../../infra/secret/secret-generator.js";
import { Clock } from "../../infra/time/clock.js";
import type { Order } from "../domain/entities/order.js";
import { OrderRepository, type PlacedOrder } from "../domain/ports/order.repository.js";
import { issuesHandoverToken } from "../domain/services/handover.js";

/** Adaptateur Prisma des commandes. */
@Injectable()
export class PrismaOrderRepository extends OrderRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly secrets: SecretGenerator,
  ) {
    super();
  }

  /**
   * Numéro humain d'une commande — `ORD-<horodatage base36>-<suffixe ULID>`.
   * L'horodatage vient du `Clock` (temps métier de la requête) et le suffixe des
   * 4 derniers caractères d'un ULID (composante aléatoire, sans `Math.random`).
   * La colonne `order_number` est `@unique` : un doublon échouerait plutôt que de
   * passer en silence. (Le vrai identifiant reste le `cuid`.)
   */
  private generateOrderNumber(): string {
    const stamp = this.clock.now().getTime().toString(36).toUpperCase();
    const suffix = this.ids.next().slice(-4);
    return `ORD-${stamp}-${suffix}`;
  }

  async place(order: Order): Promise<PlacedOrder> {
    // L'agrégat a validé et calculé ; on lit son état sérialisé. Coursier et
    // retrait ont déjà figé leurs adresses en snapshot (plus d'adresse d'entreprise).
    const state = order.toPersistence();
    return this.prisma.order.create({
      data: {
        orderNumber: this.generateOrderNumber(),
        // Le jeton de remise naît ici, au même endroit et pour la même raison que
        // le numéro : c'est une valeur générée à l'écriture, que l'agrégat n'a
        // aucun moyen de produire sans dépendre d'une source d'aléa. Seul le
        // retrait en reçoit un — cf. `issuesHandoverToken`.
        handoverToken: issuesHandoverToken(state.fulfillmentMethod) ? this.secrets.next() : null,
        companyId: state.companyId,
        placedByUserId: state.placedByUserId,
        placedByStaffId: state.placedByStaffId,
        requestedDeliveryDate: state.requestedDeliveryDate,
        fulfillmentMethod: state.fulfillmentMethod,
        deliveryZoneId: state.deliveryZoneId,
        deliveryAddressSnapshot: state.deliveryAddress ?? Prisma.DbNull,
        pickupAddress: state.pickupAddress ?? Prisma.DbNull,
        subtotalCents: state.subtotalCents,
        discountCents: state.discountCents,
        discountAdjustment: state.discountAdjustment ?? Prisma.DbNull,
        deliveryFeeCents: state.deliveryFeeCents,
        vatCents: state.vatCents,
        totalCents: state.totalCents,
        paymentStatus: state.paymentStatus,
        stripePaymentIntentId: state.stripePaymentIntentId,
        note: state.note,
        lines: {
          create: state.lines.map((line) => ({
            sku: line.sku,
            productNameSnapshot: line.productName,
            unitPriceCents: line.unitPriceCents,
            vatRate: line.vatRate,
            quantity: line.quantity,
            lineTotalCents: line.lineTotalCents,
          })),
        },
      },
      select: { id: true, orderNumber: true },
    });
  }

  async markPaid(paymentIntentId: string): Promise<void> {
    // `updateMany` + filtre `pending` = idempotence : un webhook rejoué (déjà
    // `paid`) ou un intent inconnu ne matche aucune ligne, l'appel est un no-op.
    await this.prisma.order.updateMany({
      where: { stripePaymentIntentId: paymentIntentId, paymentStatus: PaymentStatus.pending },
      data: { paymentStatus: PaymentStatus.paid, paidAt: this.clock.now() },
    });
  }

  async markPaymentFailed(paymentIntentId: string): Promise<void> {
    // Même idempotence : on ne rétrograde que ce qui était encore `pending` (un
    // paiement déjà `paid` n'est jamais repassé à `failed`).
    await this.prisma.order.updateMany({
      where: { stripePaymentIntentId: paymentIntentId, paymentStatus: PaymentStatus.pending },
      data: { paymentStatus: PaymentStatus.failed },
    });
  }

  async markHandedOver(token: string, at: Date, by: string): Promise<boolean> {
    // `handedOverAt: null` dans le WHERE : c'est la base qui arbitre, donc deux
    // scans simultanés du même QR produisent exactement une remise. La règle
    // métier, elle, a déjà été appliquée par l'appelant sur l'état lu.
    const { count } = await this.prisma.order.updateMany({
      where: { handoverToken: token, handedOverAt: null },
      data: { handedOverAt: at, handedOverBy: by, status: OrderStatus.fulfilled },
    });
    return count === 1;
  }
}
