import type { OrderHandoverShipmentView, OrderHandoverView } from "@lfd/contracts";
import { pieceTally, saleQuantity } from "@lfd/money";
import { Injectable } from "@nestjs/common";

import { QualityHoldsReader, ShipmentRef } from "../../../production/channels/handover/index.js";
import {
  StaffAuthorDirectory,
  type StaffAuthors,
} from "../../../staff/directory/domain/staff-author-directory.js";
import type {
  HandoverSubject,
  HandoverSubjectLine,
} from "../../channels/commerce/handover-subject.reader.js";
import type { OrderHandover } from "../../domain/entities/order-handover.js";
import { HandedOverOrdersReader } from "../../domain/ports/handed-over-orders.reader.js";
import { OrderHandoverRepository } from "../../domain/ports/order-handover.repository.js";
import { handoverBlocker } from "../../domain/services/handover.js";
import {
  candidateRanks,
  focusedRank,
  readyShipments,
  shipmentLines,
  shipmentPrepared,
  shipmentReference,
  type ShipmentToHandOver,
} from "../../domain/services/handover-shipments.js";
import { isHeldForQuality } from "./quality-hold.js";

/**
 * **L'écran du comptoir, par envoi** (plan E7 reliquat, choix 13, lot L4c) —
 * la vue que le scan, la file et l'accusé d'un retrait rendent.
 *
 * Elle répond toujours quand la commande existe, même si le retrait est
 * impossible : le refus part avec la commande (`blockedReason`), pas à sa
 * place. Une erreur sèche ferait disparaître le numéro et le client — les deux
 * seules choses avec lesquelles on décroche un téléphone.
 *
 * Deux sources : la commande et ses restes viennent du **commerce** (par le
 * port), les attestations de **nos** tables. Les rangs déjà retirés sont lus en
 * une requête, quel que soit le nombre de restes.
 */
@Injectable()
export class HandoverCounterView {
  constructor(
    private readonly handovers: OrderHandoverRepository,
    private readonly handedOver: HandedOverOrdersReader,
    private readonly staffAuthors: StaffAuthorDirectory,
    private readonly holds: QualityHoldsReader,
  ) {}

  /** Les envois prêts et pas encore retirés de la commande, par rang. */
  async readyOf(subject: HandoverSubject): Promise<readonly ShipmentToHandOver[]> {
    const candidates = candidateRanks(subject).map((rank) => ShipmentRef.of(subject.orderId, rank));
    const attested = await this.handedOver.handedOverAmong(candidates);
    return readyShipments(subject, new Set(attested.map(({ rank }) => rank)));
  }

  /**
   * Les envois qu'un « Remettre » vise : ceux cochés s'il y en a, sinon le
   * rang donné (un reste saisi par son numéro), sinon l'envoi que la vue
   * montrait — le rang 1 avec un seul envoi, comme avant L4c.
   */
  async ranksToHandOver(
    subject: HandoverSubject,
    checked: readonly number[] | null,
    named: number | null = null,
  ): Promise<readonly number[]> {
    if (checked !== null) {
      return checked;
    }
    return [named ?? focusedRank(await this.readyOf(subject))];
  }

  /**
   * La vue, sur `rank` s'il est donné (un reste saisi par son numéro, l'accusé
   * d'un geste), sinon sur le premier envoi prêt — le rang 1 avec un seul
   * envoi, comme avant L4c.
   */
  async viewOf(subject: HandoverSubject, rank: number | null = null): Promise<OrderHandoverView> {
    const ready = await this.readyOf(subject);
    const focus = rank ?? focusedRank(ready);
    const [handover, qualityHold] = await Promise.all([
      this.handovers.findByShipment(ShipmentRef.of(subject.orderId, focus)),
      isHeldForQuality(this.holds, subject),
    ]);
    const authors = await authorsOf(this.staffAuthors, handover);
    return toHandoverView(subject, { rank: focus, handover, qualityHold }, authors, ready);
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

/** L'envoi que la vue montre, et ce que le retrait sait de lui. */
interface FocusedShipment {
  readonly rank: number;
  readonly handover: OrderHandover | null;
  /**
   * Exigé, pas optionnel : sans lui l'écran dirait « remettable » d'une
   * commande que le geste refuse (`plan-controle-qualite.md`, D4).
   */
  readonly qualityHold: boolean;
}

/** Projette la commande, l'envoi montré et les envois prêts en vue de comptoir. */
function toHandoverView(
  subject: HandoverSubject,
  focus: FocusedShipment,
  authors: StaffAuthors,
  ready: readonly ShipmentToHandOver[],
): OrderHandoverView {
  const { handover, rank } = focus;
  const lines = shipmentLines(subject, rank);
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
    blockedReason: handoverBlocker({
      status: subject.status,
      rank,
      handedOverAt: handover === null ? null : handover.handedOverAt,
      prepared: shipmentPrepared(subject, rank),
      qualityHold: focus.qualityHold,
      settled: subject.settled,
    }),
    rank,
    reference: shipmentReference(subject.orderNumber, rank),
    shipments: ready.map(toShipmentView),
  };
}

function toShipmentView(shipment: ShipmentToHandOver): OrderHandoverShipmentView {
  return {
    rank: shipment.rank,
    reference: shipment.reference,
    totalUnits: unitsOf(shipment.lines),
    lines: shipment.lines,
  };
}

/**
 * Les pièces à recompter au comptoir : un article au poids compte pour une
 * ligne, jamais ses grammes (plan `pricing/plan-vente-au-poids.md`, § 2).
 */
function unitsOf(lines: readonly HandoverSubjectLine[]): number {
  return lines.reduce(
    (sum, line) => sum + pieceTally(saleQuantity(line.quantity, line.saleUnit)),
    0,
  );
}
