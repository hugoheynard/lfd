import type { OrderHandoverView } from "@lfd/contracts";
import { pieceTally, saleQuantity } from "@lfd/money";
import { Injectable } from "@nestjs/common";

import {
  FIRST_SHIPMENT_RANK,
  QualityHoldsReader,
  ShipmentRef,
} from "../../../production/channels/handover/index.js";
import {
  StaffAuthorDirectory,
  type StaffAuthors,
} from "../../../staff/directory/domain/staff-author-directory.js";
import type {
  HandoverSubject,
  HandoverSubjectLine,
} from "../../channels/commerce/handover-subject.reader.js";
import type { OrderHandover } from "../../domain/entities/order-handover.js";
import { OrderHandoverRepository } from "../../domain/ports/order-handover.repository.js";
import { counterHandoverBlocker } from "../../domain/services/handover.js";
import { shipmentPrepared, shipmentReference } from "../../domain/services/handover-shipments.js";
import { isHeldForQuality } from "./quality-hold.js";

/**
 * **L'écran du comptoir** — la vue que le scan, la file et l'accusé d'un
 * retrait rendent, sur l'envoi de la commande (son rang 1).
 *
 * Elle répond toujours quand la commande existe, même si le retrait est
 * impossible : le refus part avec la commande (`blockedReason`), pas à sa
 * place. Une erreur sèche ferait disparaître le numéro et le client — les deux
 * seules choses avec lesquelles on décroche un téléphone.
 *
 * Deux sources : la commande vient du **commerce** (par le port),
 * l'attestation de **nos** tables.
 */
@Injectable()
export class HandoverCounterView {
  constructor(
    private readonly handovers: OrderHandoverRepository,
    private readonly staffAuthors: StaffAuthorDirectory,
    private readonly holds: QualityHoldsReader,
  ) {}

  /** La vue de la commande, et ce que le retrait sait d'elle. */
  async viewOf(subject: HandoverSubject): Promise<OrderHandoverView> {
    const [handover, qualityHold] = await Promise.all([
      this.handovers.findByShipment(ShipmentRef.firstOf(subject.orderId)),
      isHeldForQuality(this.holds, subject),
    ]);
    const authors = await authorsOf(this.staffAuthors, handover);
    return toHandoverView(subject, { handover, qualityHold }, authors);
  }
}

/**
 * Les auteurs d'une attestation — celui qui a remis le sac, s'il y en a un
 * (`architecture-journalisation.md` §12, D3).
 */
function authorsOf(
  directory: StaffAuthorDirectory,
  handover: OrderHandover | null,
): Promise<StaffAuthors> {
  return directory.identify([handover?.handedOverBy ?? null]);
}

/** Ce que le retrait sait de la commande. */
interface HandoverStandingView {
  readonly handover: OrderHandover | null;
  /**
   * Exigé, pas optionnel : sans lui l'écran dirait « remettable » d'une
   * commande que le geste refuse (`le-controle-qualite.md`, D4).
   */
  readonly qualityHold: boolean;
}

/** Projette la commande et son attestation en vue de comptoir. */
function toHandoverView(
  subject: HandoverSubject,
  focus: HandoverStandingView,
  authors: StaffAuthors,
): OrderHandoverView {
  const { handover } = focus;
  const rank = FIRST_SHIPMENT_RANK;
  const lines = subject.lines;
  return {
    orderId: subject.orderId,
    orderNumber: subject.orderNumber,
    customerLabel: subject.customerLabel,
    placedAt: subject.placedAt.toISOString(),
    requestedDeliveryDate:
      subject.requestedDeliveryDate === null
        ? null
        : subject.requestedDeliveryDate.toISOString().slice(0, 10),
    pickupLabel: subject.pickupLabel,
    fulfillmentMethod: subject.fulfillmentMethod,
    note: subject.note,
    totalUnits: unitsOf(lines),
    lines,
    handedOverAt: handover === null ? null : handover.handedOverAt.toISOString(),
    handedOverBy: handover === null ? null : handover.handedOverBy,
    handedOverByName: handover === null ? null : authors.nameOf(handover.handedOverBy),
    handedOverVia: handover === null ? null : handover.via,
    // La règle du scan et de la saisie : un manque qui attend une décision
    // se dit avant le geste.
    blockedReason: counterHandoverBlocker({
      awaitingShortfallDecision: subject.awaitingShortfallDecision,
      status: subject.status,
      rank,
      handedOverAt: handover === null ? null : handover.handedOverAt,
      prepared: shipmentPrepared(rank),
      qualityHold: focus.qualityHold,
      settled: subject.settled,
    }),
    rank,
    reference: shipmentReference(subject.orderNumber, rank),
    settleAtShopTill: subject.settleAtShopTill,
  };
}

/**
 * Les pièces à recompter au comptoir : un article au poids compte pour une
 * ligne, jamais ses grammes (plan `pricing/vente-au-poids.md`, § 2).
 */
function unitsOf(lines: readonly HandoverSubjectLine[]): number {
  return lines.reduce(
    (sum, line) => sum + pieceTally(saleQuantity(line.quantity, line.saleUnit)),
    0,
  );
}
