import type {
  AdminCancellationRefund,
  AdminCancellationVoucher,
  AdminOrderCancellability,
  AdminOrderItemLimitOverride,
  AdminOrderView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderInscriptionReader } from "../../../../production/channels/commerce/index.js";
import {
  StaffAuthorDirectory,
  type StaffAuthors,
} from "../../../../staff/directory/domain/staff-author-directory.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { CardIncreaseProposalReader } from "../../revision/domain/ports/card-increase-proposal.reader.js";
import { AdminOrderAuthorReader } from "../../domain/ports/admin-order-author.reader.js";
import { CancellationSubjectReader } from "../../cancellation/domain/ports/cancellation-subject.reader.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { VoucherRestitution } from "../../domain/ports/loyalty-voucher-redemption.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { OrderShortfallReader } from "../../domain/ports/order-shortfall.reader.js";
import { OrderBillableReader } from "../../domain/ports/order-billable.reader.js";
import { shortfallAuthorsOf, shortfallViewOf } from "./admin-order-shortfall-view.js";
import { VoucherRestitutionPreview } from "../../domain/ports/voucher-restitution-preview.js";
import { cancellationVoucherSentenceOf } from "../../cancellation/domain/services/order-cancellation-voucher.js";
import { cancellationRefusalOf } from "../../cancellation/domain/services/order-cancellation.js";
import { cancellationRefundSentenceOf } from "../../cancellation/domain/services/order-cancellation-refund.js";
import { settlementRegimeOf } from "../../domain/services/settlement-regime.js";
import type { CancellationSubject } from "../../cancellation/domain/ports/cancellation-subject.reader.js";
import { adminCardIncreaseOf } from "../../revision/application/services/admin-order-card-increase.js";
import { AdminOrderRefundView } from "../services/admin-order-refund-view.js";
import { AdminShortfallRefundView } from "../services/admin-shortfall-refund-view.js";
import { OrderRevisabilityReading } from "../../revision/application/services/order-revisability-reading.js";
import { CancellationPreview } from "../../cancellation/application/services/cancellation-preview.js";
import { VoucherRestitutionRefusal } from "../services/voucher-restitution-refusal.js";
import { GetAdminOrderQuery } from "./get-admin-order.query.js";
import { ItemLimitOverrideReader } from "../../domain/ports/item-limit-override.reader.js";
import { OrderNoShowReader } from "../../domain/ports/order-no-show.reader.js";
import { noShowAuthorsOf, noShowViewOf } from "./admin-order-no-show-view.js";
import { OrderReviewsReader } from "../../domain/ports/order-reviews.reader.js";
import { reviewAuthorsOf, reviewStateOf } from "./admin-order-review-view.js";
import type { ItemLimitOverride } from "../../domain/services/item-limit-overrides.js";
import { OrderBackorderReader } from "../../backorder/domain/ports/order-backorder.reader.js";

/**
 * Sert une commande au staff, avec QUI l'a passée — la personne, sa société,
 * et le membre de l'équipe qui l'a saisie le cas échéant. Le 404 reste **non
 * divulguant** par cohérence de message, même si ici il n'y a rien à cacher :
 * c'est le même `OrderNotFoundError` des deux côtés, donc le même texte à
 * l'écran.
 *
 * Depuis le 2026-10-12 (doc `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.8), il
 * dit aussi si la commande s'annule, par la MÊME règle que le geste
 * (`CancellationPreview`), sans verrou : c'est un affichage. L'inscription au
 * fournil se demande au fournil, par son canal.
 *
 * Lot C3b (C3b.7) : quand la règle de commande laisse passer et que la
 * commande porte un bon, l'aperçu de la restitution dit ce que deviendra le
 * bon (`voucher`, avec sa phrase) — ou en fait le refus des cas 5 et 6.
 *
 * Depuis le 2026-10-23 (voir `documentation/commandes/modification/modifier-une-commande.md`,
 * § 2.2 « Le chemin d'une modification »), il dit aussi si l'équipe peut la modifier, par la règle du geste, et
 * sa révision courante.
 *
 * Lot E6a (plan E6 (`documentation/commandes/bon-de-livraison.md`) § 3) : et le manque
 * signalé au colisage, en vigueur — « décision attendue ».
 *
 * La hausse par carte (`documentation/commandes/modification/modifier-une-commande.md`, §2.7.10) :
 * et la hausse par carte qui attend, le projet vivant — lu par la commande
 * déjà servie, sans autre mur que le sien.
 *
 * Le reste d'un départ incomplet payé par carte (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.5) : ce que
 * « Rembourser le reste » rendrait, lu sur l'état.
 *
 * Les limites de produit que l'équipe a passées, pour qui a le droit de les
 * lire ; la lecture n'est pas faite sans lui.
 *
 * Et son visa (plan du visa des commandes) : en cours, son historique, et si
 * elle se vise — servi à qui lit la commande, c'est une trace.
 *
 * Et ses reliquats (`documentation/commandes/reliquat/reliquat.md`, § 6.5) : celui né de cette commande, et
 * celui dont elle est issue ; ses montants facturables, une fois soldée.
 */
@QueryHandler(GetAdminOrderQuery)
export class GetAdminOrderHandler implements IQueryHandler<GetAdminOrderQuery, AdminOrderView> {
  constructor(
    private readonly orders: OrderReader,
    private readonly authors: AdminOrderAuthorReader,
    private readonly staff: StaffAuthorDirectory,
    private readonly subjects: CancellationSubjectReader,
    private readonly inscriptions: OrderInscriptionReader,
    private readonly restitutions: VoucherRestitutionPreview,
    private readonly refusals: VoucherRestitutionRefusal,
    private readonly preview: CancellationPreview,
    private readonly refunds: AdminOrderRefundView,
    private readonly clock: Clock,
    private readonly revisions: OrderRevisabilityReading,
    private readonly shortfalls: OrderShortfallReader,
    private readonly cardIncreases: CardIncreaseProposalReader,
    private readonly shortfallRefunds: AdminShortfallRefundView,
    private readonly itemLimitOverrides: ItemLimitOverrideReader,
    private readonly noShows: OrderNoShowReader,
    private readonly reviews: OrderReviewsReader,
    private readonly backorders: OrderBackorderReader,
    private readonly billables: OrderBillableReader,
  ) {}

  async execute(query: GetAdminOrderQuery): Promise<AdminOrderView> {
    const [
      owned,
      author,
      cancellability,
      refundRequests,
      revision,
      shortfall,
      increase,
      shortfallRefund,
      overrides,
      noShow,
      reviews,
      backorders,
      billable,
    ] = await Promise.all([
      this.orders.findById(query.orderId),
      this.authors.authorOf(query.orderId),
      this.cancellabilityOf(query.orderId),
      this.refunds.of(query.orderId),
      this.revisions.forStaff(query.orderId),
      this.shortfalls.of(query.orderId),
      this.cardIncreases.liveOf(query.orderId),
      this.shortfallRefunds.of(query.orderId),
      query.withItemLimitOverrides ? this.itemLimitOverrides.forOrder(query.orderId) : null,
      this.noShows.of(query.orderId),
      this.reviews.of(query.orderId),
      this.backorders.of(query.orderId),
      this.billables.of(query.orderId),
    ]);
    if (owned === null || author === null || cancellability === null || revision === null) {
      throw new OrderNotFoundError(query.orderId);
    }
    // Une seule lecture de l'annuaire : qui a saisi, qui a décidé le départ et
    // qui a prévenu, qui a
    // passé outre une limite de produit, qui a déclaré la commande non retirée,
    // qui l'a visée.
    const staffAuthors = await this.staff.identify([
      author.placedByStaffId,
      ...shortfallAuthorsOf(shortfall),
      ...(overrides ?? []).map((override) => override.staffUserId),
      ...noShowAuthorsOf(noShow),
      ...reviewAuthorsOf(reviews),
    ]);
    return {
      ...owned.view,
      clientele: owned.clientele,
      entryOrigin: owned.entryOrigin,
      offer: owned.offer ?? null,
      placedBy: {
        customer: author.customer,
        company: author.company,
        staffName: staffAuthors.nameOf(author.placedByStaffId),
      },
      cancellability,
      refundRequests,
      revisability: revision.revisability,
      revision: revision.revision,
      shortfall: shortfall === null ? null : shortfallViewOf(shortfall, staffAuthors),
      cardIncrease: adminCardIncreaseOf(increase),
      shortfallRefund,
      noShow: noShowViewOf(noShow, staffAuthors),
      backorder: backorders.backorder,
      backorderOrigin: backorders.origin,
      billable,
      ...(reviews === null ? {} : { review: reviewStateOf(reviews, staffAuthors) }),
      ...(overrides === null
        ? {}
        : {
            itemLimitOverrides: overrides.map((override) => overrideViewOf(override, staffAuthors)),
          }),
    };
  }

  private async cancellabilityOf(orderId: string): Promise<AdminOrderCancellability | null> {
    const [subject, inscribedDay] = await Promise.all([
      this.subjects.find(orderId),
      this.inscriptions.inscribedDayOf(orderId),
    ]);
    if (subject === null) {
      return null;
    }
    // Lot C5 : au compte, la règle lit aussi l'engagement comptable — par le
    // port de LECTURE seul (ISP), sans verrou : c'est un affichage.
    // Plan A1 : l'autorisation du geste, lue au réglage — le staff suit la
    // limite du particulier —, et le bac fermé au colisage (lot A1.3).
    const decision = await this.preview.decisionOf(subject, inscribedDay);
    if (!decision.cancellable) {
      return { cancellable: false, reason: cancellationRefusalOf(decision.block) };
    }
    const refund = refundPreviewOf(subject);
    if (subject.loyaltyVoucherId === null) {
      return { cancellable: true, voucher: null, refund };
    }
    const restitution = await this.restitutions.previewOf(
      subject.loyaltyVoucherId,
      this.clock.now(),
    );
    if (restitution.kind === "blocked") {
      const voucherBlock = await this.refusals.blockOf(restitution);
      return { cancellable: false, reason: cancellationRefusalOf(voucherBlock) };
    }
    return { cancellable: true, voucher: voucherPreviewOf(restitution), refund };
  }
}

/** Un dépassement consigné, dans la forme du contrat. */
function overrideViewOf(
  override: ItemLimitOverride,
  staff: StaffAuthors,
): AdminOrderItemLimitOverride {
  return {
    sku: override.sku,
    staffUserId: override.staffUserId,
    staffName: staff.nameOf(override.staffUserId),
    reason: override.reason,
    daysBefore: override.daysBefore,
    time: override.time,
    limitAt: override.limitAt.toISOString(),
    origin: override.origin,
    recordedAt: override.createdAt.toISOString(),
  };
}

/** Lot C4 (C4.9) : ce que l'annulation d'une payée rendra — `null` hors carte payée. */
function refundPreviewOf(subject: CancellationSubject): AdminCancellationRefund | null {
  if (
    settlementRegimeOf(
      subject.paymentStatus,
      subject.totalCents,
      subject.settlementVenue,
      subject.offered,
    ) !== "paid"
  ) {
    return null;
  }
  const amountCents = subject.refunds.refundableCents;
  return { amountCents, sentence: cancellationRefundSentenceOf(amountCents) };
}

/** L'issue annoncée, avec sa phrase ; `already` (impossible sur une commande vivante) n'annonce rien. */
function voucherPreviewOf(restitution: VoucherRestitution): AdminCancellationVoucher | null {
  if (restitution.kind === "already" || restitution.kind === "blocked") {
    return null;
  }
  const { voucherValueCents, remainderValueCents, expiresAt } = restitution;
  const at = expiresAt.toISOString();
  if (restitution.kind === "merged" && remainderValueCents !== null) {
    const merged = {
      outcome: "merged",
      voucherValueCents,
      remainderValueCents,
      expiresAt,
    } as const;
    return { ...merged, expiresAt: at, sentence: cancellationVoucherSentenceOf(merged) };
  }
  const outcome = restitution.kind === "lapsed" ? "lapsed" : "returned";
  const plain = { outcome, voucherValueCents, expiresAt } as const;
  return { ...plain, expiresAt: at, sentence: cancellationVoucherSentenceOf(plain) };
}
