import { Injectable } from "@nestjs/common";

import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { SecretGenerator } from "../../../platform/secret/secret-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import type { Order } from "../domain/entities/order.js";
import {
  OrderRepository,
  type AbandonedSettlement,
  type PlacedOrder,
} from "../domain/ports/order.repository.js";
import { issuesHandoverToken, type HandoverVia } from "../domain/services/handover.js";
import { jsonSteps, toFulfillmentJson } from "./order-json.js";
import { planWhere } from "./plan-filter.js";

/** Adaptateur Prisma des commandes. */
/**
 * D'où peut partir chaque bascule de règlement. Un encaissement part d'une
 * attente OU d'un refus : le client a pu réessayer une autre carte sur la même
 * intention. Un refus ne part que d'une attente : il ne rétrograde jamais un
 * encaissement, et un second refus ne republie rien.
 */
const PAID_FROM: readonly PaymentStatus[] = [PaymentStatus.pending, PaymentStatus.failed];
const FAILED_FROM: readonly PaymentStatus[] = [PaymentStatus.pending];
/** Un règlement non encaissé : en attente, ou refusé et encore reprenable. */
const UNSETTLED: readonly PaymentStatus[] = [PaymentStatus.pending, PaymentStatus.failed];

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
        // aucun moyen de produire sans dépendre d'une source d'aléa.
        //
        // ⚠️ « Seul le retrait en reçoit un » disait cette ligne jusqu'au
        // 2026-09-10 — faux depuis le 2026-09-07. `issuesHandoverToken()` n'a
        // plus de paramètre : les deux acheminements en reçoivent un, parce que
        // le coursier scanne aussi. La fonction reste pour NOMMER la décision.
        handoverToken: issuesHandoverToken() ? this.secrets.next() : null,
        companyId: state.companyId,
        // Qui commande, déduit par l'agrégat et figé : jamais relu depuis la
        // société, qui peut changer ou disparaître après la passation.
        clientele: state.clientele,
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
        deliveryFeeAdjustment: state.deliveryFeeAdjustment ?? Prisma.DbNull,
        deliveryFeeCents: state.deliveryFeeCents,
        lateFeeCents: state.lateFeeCents,
        // L'ajustement ET son taux, figés ensemble : un montant sans son taux ne
        // se justifie pas devant un comptable, et il ne se recalcule pas — le
        // réglage aura changé.
        lateFeeAdjustment: state.lateFeeAdjustment ?? Prisma.DbNull,
        vatCents: state.vatCents,
        // La ventilation part AVEC le total, pas à côté : c'est ce qui
        // permettra au bon de détailler « dont TVA 5,5 % » sans rien refaire.
        // Recopiées en objets nus : Prisma refuse une interface dans un champ
        // JSON (il lui manque la signature d'index), et un cast masquerait
        // qu'on écrit une FORME, pas un type du domaine.
        vatShares: state.vatShares.map((share) => ({
          rate: share.rate,
          amountCents: share.amountCents,
        })),
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
            // 🔴 Écrits tels que l'agrégat les a scellés, `null` compris : c'est
            // LUI qui sait si l'acheteur était un particulier, et cette
            // question ne se repose plus jamais après (R3, 2026-09-21).
            unitPriceTtcCents: line.unitPriceTtcCents,
            lineTotalTtcCents: line.lineTotalTtcCents,
            basePriceMillicents: line.pricing?.basePriceMillicents ?? null,
            // `Prisma.DbNull` et non `null` : sur une colonne JSON nullable,
            // `null` désigne le *littéral* JSON `null`, pas l'absence de valeur.
            // Les deux se relisent différemment, et c'est précisément la
            // distinction qu'on veut tenir ici — absence = commande antérieure.
            pricingSteps: line.pricing === null ? Prisma.DbNull : jsonSteps(line.pricing.steps),
            pricingFloored: line.pricing?.floored ?? null,
            pricingClampedToZero: line.pricing?.clampedToZero ?? null,
            pricingFloor:
              line.pricing?.floorDecision == null
                ? Prisma.DbNull
                : { ...line.pricing.floorDecision },
            pricingCommitment:
              line.pricing?.commitment == null ? Prisma.DbNull : { ...line.pricing.commitment },
            // Même `Prisma.DbNull`, et il porte ici les trois états de la
            // colonne : absence = « on ne consignait pas », `[]` = « le moteur
            // n'a écarté personne », valeur = qui et pourquoi. Une ligne neuve
            // écrit toujours l'un des deux derniers.
            pricingRejected:
              line.pricing?.rejected == null
                ? Prisma.DbNull
                : line.pricing.rejected.map((entry) => ({ ...entry, scope: { ...entry.scope } })),
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

  async markPaid(paymentIntentId: string): Promise<string | null> {
    // `updateMany` + filtre sur l'état d'origine = idempotence : un webhook
    // rejoué (déjà `paid`) ou un intent inconnu ne matche aucune ligne.
    //
    // 🔴 `failed` est une origine légitime. Un refus rend l'intention Stripe à
    // `requires_payment_method` : le client peut saisir une autre carte sur la
    // même page, et `succeeded` suit sur la MÊME intention. Ne partir que de
    // `pending` laissait un client débité devant une commande « refusée »,
    // exclue de la production (constaté le 2026-09-26,
    // `test/order-payment-retry.e2e-spec.ts`). Un encaissement réel l'emporte
    // toujours sur un refus antérieur.
    return this.settle(paymentIntentId, PaymentStatus.paid, PAID_FROM);
  }

  async markPaymentFailed(paymentIntentId: string): Promise<string | null> {
    // Même idempotence : on ne rétrograde que ce qui était encore `pending` (un
    // paiement déjà `paid` n'est jamais repassé à `failed`).
    return this.settle(paymentIntentId, PaymentStatus.failed, FAILED_FROM);
  }

  /**
   * **La bascule de règlement, et l'identifiant de ce qui a franchi.**
   *
   * 🔴 Les deux transitions rendaient `void`, et c'est ce qui rendait le fait
   * impossible à publier : on savait qu'une bascule avait été DEMANDÉE, jamais
   * si elle avait eu lieu ni sur quoi. Le client n'était donc prévenu de rien —
   * ni d'un encaissement, ni d'un refus (2026-09-17).
   *
   * L'identité se lit AVANT l'écriture : `stripePaymentIntentId` est `@unique`,
   * donc au plus une ligne, et `updateMany` ne rend qu'un compte. C'est ce
   * compte — et lui seul — qui dit s'il y a eu franchissement.
   *
   * ⚠️ **`count === 0` rend `null`, et c'est le cœur de l'idempotence.** Stripe
   * réémet jusqu'à obtenir un 2xx : un second passage ne trouve plus rien dans
   * l'état d'origine, ne publie donc aucun fait, et le client ne reçoit pas deux fois
   * le même message. La garantie tient dans le `where`, pas dans un garde ajouté
   * par-dessus.
   */
  private async settle(
    paymentIntentId: string,
    to: PaymentStatus,
    from: readonly PaymentStatus[],
  ): Promise<string | null> {
    const order = await this.prisma.order.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
      select: { id: true },
    });
    if (order === null) {
      return null;
    }
    const { count } = await this.prisma.order.updateMany({
      where: {
        stripePaymentIntentId: paymentIntentId,
        paymentStatus: { in: [...from] },
        // 🔴 **Une commande annulée ne se rouvre jamais** (2026-09-26). Depuis
        // l'abandon, `cancelled` s'écrit ; son règlement vaut `failed`, donc
        // `PAID_FROM` l'aurait repassée `paid` sur un encaissement tardif — une
        // commande annulée, payée, que personne ne produira. Le refus ici la
        // laisse annulée ; l'argent, lui, est reçu chez Stripe, et c'est
        // `ConfirmOrderPaymentHandler` qui fait sonner « à rembourser » quand
        // rien n'a franchi (lot 6 bis du plan d'abandon).
        status: { not: OrderStatus.cancelled },
      },
      data:
        to === PaymentStatus.paid
          ? { paymentStatus: PaymentStatus.paid, paidAt: this.clock.now() }
          : { paymentStatus: PaymentStatus.failed },
    });
    return count === 0 ? null : order.id;
  }

  async markAbandoned(orderId: string): Promise<AbandonedSettlement | null> {
    // Deux écritures exclusives par leur `where` : la clientèle est figée, une
    // seule des deux peut trouver la ligne. Le public d'abord — c'est le cas
    // courant de l'écran de règlement.
    const cancelled = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        clientele: OrderClientele.public,
        status: OrderStatus.placed,
        paymentStatus: { in: [...UNSETTLED] },
      },
      data: { status: OrderStatus.cancelled, paymentStatus: PaymentStatus.failed },
    });
    if (cancelled.count === 1) {
      return "cancelled";
    }
    // Pro, ou clientèle inconnue : `clientele <> 'public'` serait FAUX sur
    // `NULL` en SQL, d'où les deux branches écrites. Depuis la seule attente :
    // un refus déjà posé a déjà publié son fait, un second abandon ne dit rien.
    const failed = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        OR: [{ clientele: OrderClientele.pro }, { clientele: null }],
        status: OrderStatus.placed,
        paymentStatus: PaymentStatus.pending,
      },
      data: { paymentStatus: PaymentStatus.failed },
    });
    return failed.count === 1 ? "failed" : null;
  }

  async failAtClosing(orderId: string): Promise<boolean> {
    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, status: OrderStatus.placed, paymentStatus: { in: [...UNSETTLED] } },
      data: { status: OrderStatus.cancelled, paymentStatus: PaymentStatus.failed },
    });
    return count === 1;
  }

  async absorbIntoPlan(serviceDay: string, at: Date): Promise<number> {
    // `status: placed` dans le WHERE : c'est la base qui applique la règle
    // nommée par `absorbedByPlan`. Une commande déjà plus avancée n'est pas
    // touchée — les états ne reculent jamais — et une seconde clôture n'en
    // trouve aucune, donc n'en change aucune.
    const { count } = await this.prisma.order.updateMany({
      where: {
        requestedDeliveryDate: new Date(`${serviceDay}T00:00:00.000Z`),
        // 🔴 **Le fragment PARTAGÉ** (2026-09-17). C'est ICI que la règle
        // s'écrivait en dur, et les trois autres surfaces la recopiaient — mal.
        // Les quatre lisent la même fonction désormais : `absorbedByPlan` ne se
        // contente plus de NOMMER la règle, `planWhere` la fournit.
        ...planWhere(),
      },
      data: { status: OrderStatus.confirmed, confirmedAt: at },
    });
    return count;
  }

  async markReady(reference: string, at: Date, by: string): Promise<boolean> {
    // `readyAt: null` dans le WHERE : c'est la base qui arbitre, donc deux scans
    // simultanés de la même fiche produisent exactement un colisage.
    //
    // 🔴 Et le STATUT, ajouté le 2026-09-07. Cette condition était la seule des
    // quatre écritures d'état à ne pas poser sa règle en base : une commande
    // annulée pouvait devenir `ready` pourvu que `readyAt` fût nul. Elle ne le
    // devenait pas, parce que `packingBlocker` l'attrape dans le handler — mais
    // c'était une règle APPLIQUÉE, pas refusée, avec les deux faiblesses que ça
    // implique : un second appelant (reprise en masse, script d'exploitation)
    // n'en hériterait pas, et une annulation qui tombe entre la lecture du
    // handler et son écriture passait. C'est exactement la course que
    // `handedOverAt: null` interdit chez les trois autres.
    const { count } = await this.prisma.order.updateMany({
      where: {
        orderNumber: reference,
        readyAt: null,
        status: { notIn: [OrderStatus.cancelled, OrderStatus.draft, OrderStatus.fulfilled] },
      },
      data: { readyAt: at, readyBy: by, status: OrderStatus.ready },
    });
    return count === 1;
  }

  async markFulfilled(reference: string, at: Date, by: string, via: HandoverVia): Promise<boolean> {
    // `handedOverAt: null` dans le WHERE : c'est la base qui arbitre. Le fait
    // vient du fournil, qui a déjà tranché la course sur SA contrainte
    // d'unicité — mais un abonné rappelé ne doit pas réécrire l'attestation, et
    // une condition ici coûte moins qu'un raisonnement sur qui a rejoué quoi.
    const { count } = await this.prisma.order.updateMany({
      where: { orderNumber: reference, handedOverAt: null },
      data: {
        handedOverAt: at,
        handedOverBy: by,
        handedOverVia: via,
        status: OrderStatus.fulfilled,
      },
    });
    return count === 1;
  }
}
