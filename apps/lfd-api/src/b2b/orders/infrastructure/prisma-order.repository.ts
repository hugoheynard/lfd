import type { SalesTermsDocument } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { SecretGenerator } from "../../../platform/secret/secret-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import type { Order } from "../domain/entities/order.js";
import {
  OrderRepository,
  type AbandonedSettlement,
  type PlacedOrder,
} from "../domain/ports/order.repository.js";
import { formatOrderNumber } from "../domain/services/order-number.js";
import { issuesHandoverToken, type HandoverVia } from "../domain/services/handover.js";
import { toFulfillmentJson } from "./order-json.js";
import { orderLineDataOf } from "./order-line.data.js";
import { planWhere } from "./plan-filter.js";

/**
 * La clé de ligne de chaque texte de CGV — tenue par le CHECK
 * `orders_sales_terms_key_check`, et la même que dans `platform_content`
 * (plan `legal/plan-cgv-par-audience.md`, C4). Une table explicite : un
 * renommage de vocabulaire ne doit pas changer une valeur stockée.
 */
const SALES_TERMS_ROW_KEYS: Readonly<Record<SalesTermsDocument, string>> = {
  salesTerms: "sales-terms",
  salesTermsPro: "sales-terms-pro",
};

/** Le compteur n'a rendu aucune ligne — impossible sur un `INSERT … RETURNING`. */
class OrderNumberCounterSilentError extends TechnicalError {
  constructor() {
    super(
      "orders.order_number.counter_silent",
      "Le compteur des numéros de commande n'a rendu aucun rang : la commande n'est pas passée. Prévenir l'équipe technique.",
    );
  }
}

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
    private readonly secrets: SecretGenerator,
  ) {
    super();
  }

  /**
   * Numéro humain d'une commande — `ORD-<n>`, le rang suivant du compteur
   * unique de la plateforme (plan `commandes/plan-numero-de-commande-court.md`).
   * `INSERT … ON CONFLICT DO UPDATE … RETURNING`, comme le compteur des
   * factures : la ligne reste verrouillée jusqu'au COMMIT de la passation, une
   * passation concurrente attend puis prend le rang suivant. Un échec après
   * coup laisse un trou, sans conséquence : une commande n'est pas une pièce
   * comptable. `order_number` reste `@unique`. (Le vrai identifiant est le `cuid`.)
   */
  private async nextOrderNumber(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ last_rank: number }[]>`
      INSERT INTO "order_number_counter" ("singleton", "last_rank")
      VALUES (TRUE, 1)
      ON CONFLICT ("singleton")
      DO UPDATE SET "last_rank" = "order_number_counter"."last_rank" + 1
      RETURNING "last_rank"`;
    const rank = rows[0]?.last_rank;
    if (rank === undefined) {
      throw new OrderNumberCounterSilentError();
    }
    return formatOrderNumber(rank);
  }

  async place(order: Order): Promise<PlacedOrder> {
    // L'agrégat a validé et calculé ; on lit son état sérialisé. Coursier et
    // retrait ont déjà figé leurs adresses en snapshot (plus d'adresse d'entreprise).
    const state = order.toPersistence();
    return this.prisma.order.create({
      data: {
        orderNumber: await this.nextOrderNumber(),
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
        // Le payeur copié à la passation (sous-comptes §2.3).
        billedCompanyId: state.billedCompanyId,
        // Le principal et ce qu'il voit, copiés à la passation (avis au principal, §2).
        principalCompanyId: state.principalCompanyId,
        principalSeesAmount: state.principalSeesAmount,
        // Qui commande, déduit par l'agrégat et figé : jamais relu depuis la
        // société, qui peut changer ou disparaître après la passation.
        clientele: state.clientele,
        // La langue de la boutique à la passation (lot A3) ; `null` = pas dite.
        locale: state.locale,
        placedByUserId: state.placedByUserId,
        placedByStaffId: state.placedByStaffId,
        placedOffPlan: state.placedOffPlan,
        requestedDeliveryDate: state.requestedDeliveryDate,
        // D'où venaient les articles, jamais à quel prix — celui-là est sur la
        // ligne. `null` = aucune version posée à cet instant, ce qui est la
        // vérité pour toute commande antérieure à la première validation.
        catalogVersionId: state.catalogVersionId,
        fulfillmentMethod: state.fulfillmentMethod,
        deliveryZoneId: state.deliveryZoneId,
        deliveryAddressSnapshot: state.deliveryAddress ?? Prisma.DbNull,
        // Le lien vers le carnet, confirmé sous le mur avant d'entrer dans
        // l'agrégat : la feuille de route y relit consignes et procédure.
        deliveryAddressId: state.deliveryAddressId,
        pickupAddress: state.pickupAddress ?? Prisma.DbNull,
        // L'acheminement convenu, figé avec sa provenance — plus jamais relu.
        fulfillment: toFulfillmentJson(state.agreed),
        subtotalCents: state.subtotalCents,
        discountCents: state.discountCents,
        discountAdjustment: state.discountAdjustment ?? Prisma.DbNull,
        // Le bon, et ce qu'il a imputé — à part de la remise (plan des points, C2).
        // L'index unique partiel refuse un second bon vivant, même si l'agrégat
        // du bon l'avait laissé passer.
        voucherDiscountCents: state.voucherDiscountCents,
        loyaltyVoucherId: state.loyaltyVoucherId,
        deliveryFeeAdjustment: state.deliveryFeeAdjustment ?? Prisma.DbNull,
        deliveryFeeCents: state.deliveryFeeCents,
        lateFeeCents: state.lateFeeCents,
        // L'ajustement ET son taux, figés ensemble : un montant sans son taux ne
        // se justifie pas devant un comptable, et il ne se recalcule pas — le
        // réglage aura changé.
        lateFeeAdjustment: state.lateFeeAdjustment ?? Prisma.DbNull,
        // Le mode de TVA du port, figé : c'est ce que l'écran et le dossier de
        // facturation relisent — rien ne recalcule la commande.
        deliveryVatMode: state.deliveryVatMode,
        // Les CGV en vigueur pour l'audience qui l'a tarifée (C4′), figées avec
        // elle, dans la même écriture — donc dans la transaction de passation.
        salesTermsKey: SALES_TERMS_ROW_KEYS[state.salesTerms.document],
        salesTermsRevision: state.salesTerms.revision,
        salesTermsFileId: state.salesTerms.fileId,
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
          create: state.lines.map(orderLineDataOf),
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

  async absorbIntoPlan(serviceDay: string, orderIds: readonly string[], at: Date): Promise<number> {
    // `status: placed` dans le WHERE : c'est la base qui applique la règle
    // nommée par `absorbedByPlan`. Une commande déjà plus avancée n'est pas
    // touchée — les états ne reculent jamais — et une seconde clôture n'en
    // trouve aucune, donc n'en change aucune.
    // `id IN orderIds` : seules les commandes de l'instantané (cf. le port).
    const { count } = await this.prisma.order.updateMany({
      where: {
        id: { in: [...orderIds] },
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

  async markFulfilled(
    reference: string,
    at: Date,
    by: string,
    via: HandoverVia,
    receivedOn: string,
  ): Promise<boolean> {
    // `handedOverAt: null` dans le WHERE : c'est la base qui arbitre. Le fait
    // vient du fournil, qui a déjà tranché la course sur SA contrainte
    // d'unicité — mais un abonné rappelé ne doit pas réécrire l'attestation, et
    // une condition ici coûte moins qu'un raisonnement sur qui a rejoué quoi.
    //
    // 🔴 Et le STATUT, depuis le 2026-10-12 (plan d'annulation, S1) : une
    // commande annulée ne devient jamais `fulfilled` — un fait de retrait
    // tardif sur une annulée ne la ressuscite pas, il rend `false`.
    const where = {
      orderNumber: reference,
      handedOverAt: null,
      status: { not: OrderStatus.cancelled },
    };
    const handedOver = {
      handedOverAt: at,
      handedOverBy: by,
      handedOverVia: via,
      status: OrderStatus.fulfilled,
    };
    // La date de réception part dans la MÊME instruction que la remise
    // (date-de-reception, B2). Depuis B4, la base refuse l'une sans
    // l'autre (`orders_handover_has_received_on` et son sens inverse) : une
    // commande pas encore remise n'a jamais de date, il n'y a plus de cas où
    // elle serait déjà posée.
    const { count } = await this.prisma.order.updateMany({
      where,
      data: { ...handedOver, receivedOn: new Date(`${receivedOn}T00:00:00.000Z`) },
    });
    return count === 1;
  }
}
