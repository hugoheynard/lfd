import type {
  AdminCancellationRefund,
  AdminCancellationVoucher,
  AdminOrderCancellability,
  AdminOrderShortfall,
  AdminOrderView,
  AdminShortfallCustomerNotice,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderInscriptionReader } from "../../../../production/channels/commerce/index.js";
import {
  StaffAuthorDirectory,
  type StaffAuthors,
} from "../../../../staff/directory/domain/staff-author-directory.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { AdminOrderAuthorReader } from "../../domain/ports/admin-order-author.reader.js";
import { CancellationSubjectReader } from "../../domain/ports/cancellation-subject.reader.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { VoucherRestitution } from "../../domain/ports/loyalty-voucher-redemption.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import {
  OrderShortfallReader,
  type OrderShortfallReading,
} from "../../domain/ports/order-shortfall.reader.js";
import { VoucherRestitutionPreview } from "../../domain/ports/voucher-restitution-preview.js";
import { cancellationVoucherSentenceOf } from "../../domain/services/order-cancellation-voucher.js";
import {
  cancellationBlocker,
  cancellationRefusalOf,
} from "../../domain/services/order-cancellation.js";
import { cancellationRefundSentenceOf } from "../../domain/services/order-cancellation-refund.js";
import { settlementRegimeOf } from "../../domain/services/settlement-regime.js";
import type { CancellationSubject } from "../../domain/ports/cancellation-subject.reader.js";
import { AdminOrderRefundView } from "../services/admin-order-refund-view.js";
import { OrderRevisabilityReading } from "../services/order-revisability-reading.js";
import { CancellationRule } from "../services/cancellation-rule.js";
import { VoucherRestitutionRefusal } from "../services/voucher-restitution-refusal.js";
import { GetAdminOrderQuery } from "./get-admin-order.query.js";

/**
 * Sert une commande au staff, avec QUI l'a passée — la personne, sa société,
 * et le membre de l'équipe qui l'a saisie le cas échéant. Le 404 reste **non
 * divulguant** par cohérence de message, même si ici il n'y a rien à cacher :
 * c'est le même `OrderNotFoundError` des deux côtés, donc le même texte à
 * l'écran.
 *
 * Depuis le 2026-10-12 (doc `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.8), il
 * dit aussi si la commande s'annule, par la MÊME règle que le geste
 * (`cancellationBlocker`), sans verrou : c'est un affichage. L'inscription au
 * fournil se demande au fournil, par son canal.
 *
 * Lot C3b (C3b.7) : quand la règle de commande laisse passer et que la
 * commande porte un bon, l'aperçu de la restitution dit ce que deviendra le
 * bon (`voucher`, avec sa phrase) — ou en fait le refus des cas 5 et 6.
 *
 * Depuis le 2026-10-23 (plan `documentation/commandes/modification/plan-modifier-une-commande.md`,
 * §6), il dit aussi si l'équipe peut la modifier, par la règle du geste, et
 * sa révision courante.
 *
 * Lot E6a (plan E6 (`documentation/commandes/bon-de-livraison.md`) § 3) : et le manque
 * signalé au colisage, en vigueur — « décision attendue ».
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
    private readonly rule: CancellationRule,
    private readonly refunds: AdminOrderRefundView,
    private readonly clock: Clock,
    private readonly revisions: OrderRevisabilityReading,
    private readonly shortfalls: OrderShortfallReader,
  ) {}

  async execute(query: GetAdminOrderQuery): Promise<AdminOrderView> {
    const [owned, author, cancellability, refund, revision, shortfall] = await Promise.all([
      this.orders.findById(query.orderId),
      this.authors.authorOf(query.orderId),
      this.cancellabilityOf(query.orderId),
      this.refunds.of(query.orderId),
      this.revisions.forStaff(query.orderId),
      this.shortfalls.of(query.orderId),
    ]);
    if (owned === null || author === null || cancellability === null || revision === null) {
      throw new OrderNotFoundError(query.orderId);
    }
    const notifier = shortfall?.decision?.customerNotice?.byStaffId;
    const staffAuthors = await this.staff.identify(
      notifier === undefined ? [author.placedByStaffId] : [author.placedByStaffId, notifier],
    );
    return {
      ...owned.view,
      clientele: owned.clientele,
      placedBy: {
        customer: author.customer,
        company: author.company,
        staffName: staffAuthors.nameOf(author.placedByStaffId),
      },
      cancellability,
      refund,
      revisability: revision.revisability,
      revision: revision.revision,
      shortfall: shortfall === null ? null : shortfallViewOf(shortfall, staffAuthors),
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
    const block = cancellationBlocker(await this.rule.stateOf(subject, inscribedDay));
    if (block !== null) {
      return { cancellable: false, reason: cancellationRefusalOf(block) };
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

/** Le manque signalé, dans la forme du contrat (E6a) ; le client prévenu, nommé (E6d). */
function shortfallViewOf(reading: OrderShortfallReading, staff: StaffAuthors): AdminOrderShortfall {
  return {
    reportedAt: reading.reportedAt.toISOString(),
    lines: reading.lines.map((line) => ({ sku: line.sku, due: line.due, packed: line.packed })),
    decision:
      reading.decision === null
        ? null
        : {
            decidedAt: reading.decision.decidedAt.toISOString(),
            remainder: reading.decision.remainder,
            customerNotice: customerNoticeViewOf(reading.decision.customerNotice, staff),
          },
  };
}

function customerNoticeViewOf(
  notice: { readonly at: Date; readonly byStaffId: string } | null,
  staff: StaffAuthors,
): AdminShortfallCustomerNotice | null {
  return notice === null
    ? null
    : { notifiedAt: notice.at.toISOString(), notifiedByName: staff.nameOf(notice.byStaffId) };
}

/** Lot C4 (C4.9) : ce que l'annulation d'une payée rendra — `null` hors carte payée. */
function refundPreviewOf(subject: CancellationSubject): AdminCancellationRefund | null {
  if (settlementRegimeOf(subject.paymentStatus, subject.totalCents) !== "paid") {
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
