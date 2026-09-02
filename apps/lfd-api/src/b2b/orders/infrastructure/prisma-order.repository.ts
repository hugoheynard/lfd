import type { OrderFulfillment, PriceStepView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { OrderStatus, PaymentStatus, Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { SecretGenerator } from "../../../platform/secret/secret-generator.js";
import { Clock } from "../../../platform/time/clock.js";
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
        // D'où venaient les articles, jamais à quel prix — celui-là est sur la
        // ligne. `null` = aucune version posée à cet instant, ce qui est la
        // vérité pour toute commande antérieure à la première validation.
        catalogVersionId: state.catalogVersionId,
        fulfillmentMethod: state.fulfillmentMethod,
        deliveryZoneId: state.deliveryZoneId,
        deliveryAddressSnapshot: state.deliveryAddress ?? Prisma.DbNull,
        pickupAddress: state.pickupAddress ?? Prisma.DbNull,
        // L'acheminement convenu, figé avec sa provenance — plus jamais relu.
        fulfillment: toFulfillmentJson(state.agreed),
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
            unitPriceMillicents: line.unitPriceMillicents,
            vatRate: line.vatRate,
            quantity: line.quantity,
            lineTotalCents: line.lineTotalCents,
            basePriceMillicents: line.pricing?.basePriceMillicents ?? null,
            // `Prisma.DbNull` et non `null` : sur une colonne JSON nullable,
            // `null` désigne le *littéral* JSON `null`, pas l'absence de valeur.
            // Les deux se relisent différemment, et c'est précisément la
            // distinction qu'on veut tenir ici — absence = commande antérieure.
            pricingSteps: line.pricing === null ? Prisma.DbNull : jsonSteps(line.pricing.steps),
            pricingFloored: line.pricing?.floored ?? null,
            pricingFloor:
              line.pricing?.floorDecision == null
                ? Prisma.DbNull
                : { ...line.pricing.floorDecision },
            pricingCommitment:
              line.pricing?.commitment == null ? Prisma.DbNull : { ...line.pricing.commitment },
            // Même distinction, et elle porte ici l'enjeu le plus lourd du
            // fichier : `Prisma.DbNull` dit « on ne sait pas », là où un `[]`
            // écrit affirmerait « aucun allergène ». Sur une commande qu'on
            // relira après une réclamation, la seconde phrase est celle qu'on
            // ne doit jamais fabriquer.
            allergens:
              line.allergens === null
                ? Prisma.DbNull
                : {
                    codes: line.allergens.codes === null ? null : [...line.allergens.codes],
                    labels:
                      line.allergens.labels === null
                        ? null
                        : line.allergens.labels.map((entry) => ({ ...entry })),
                    incomplete: line.allergens.incomplete,
                  },
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

/**
 * L'acheminement convenu, en JSON **écrit explicitement**.
 *
 * Prisma refuse un type `readonly` comme valeur JSON, et un cast l'aurait fait
 * taire sans rien garantir. Recopier la forme ici la rend symétrique de
 * `orderFulfillmentSchema`, qui la relit : les deux bouts sont visibles côte à
 * côte, et un champ ajouté d'un seul côté se voit.
 */
function toFulfillmentJson(agreed: OrderFulfillment): Prisma.InputJsonValue {
  return {
    window: {
      value: agreed.window.value === null ? null : { ...agreed.window.value },
      source: agreed.window.source,
    },
    contact: {
      value: agreed.contact.value === null ? null : { ...agreed.contact.value },
      source: agreed.contact.source,
    },
    signatureRequired: { ...agreed.signatureRequired },
  };
}

/**
 * Les étages, en JSON pur.
 *
 * Recopiés champ à champ plutôt que passés tels quels : `PriceStepView` est une
 * **interface**, et TypeScript ne leur accorde pas de signature d'index — donc
 * elle n'est pas assignable au type JSON de Prisma. Le mapping n'est pas une
 * cérémonie : il rend explicite ce qui part en base, et une nouvelle propriété
 * du domaine ne s'y invitera pas sans qu'on l'ait décidé.
 */
function jsonSteps(steps: readonly PriceStepView[]): Prisma.InputJsonValue {
  return steps.map((step) => ({
    stage: step.stage,
    ruleId: step.ruleId,
    label: step.label,
    resultMillicents: step.resultMillicents,
  }));
}
