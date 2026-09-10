import type { OrderHandoverView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { HandoverSubject } from "../../channels/commerce/handover-subject.reader.js";
import { HandoverSubjectReader } from "../../channels/commerce/handover-subject.reader.js";
import type { OrderHandover } from "../../domain/entities/order-handover.js";
import { HandoverTokenNotFoundError } from "../../domain/errors/handover-errors.js";
import { OrderHandoverRepository } from "../../domain/ports/order-handover.repository.js";
import { handoverBlocker } from "../../domain/services/handover.js";
import { GetHandoverQuery } from "./get-handover.query.js";

/**
 * L'écran de comptoir : ce que le staff a sous les yeux entre le scan et le
 * bouton de confirmation.
 *
 * Il **répond toujours** quand le jeton existe, même si la remise est
 * impossible : le refus part avec la commande (`blockedReason`), pas à la place.
 * Une erreur sèche ferait disparaître de l'écran le numéro et le client — les
 * deux seules choses avec lesquelles on peut décrocher un téléphone.
 *
 * ## Deux sources, et c'est la forme normale ici
 *
 * La commande vient du **commerce** (par le port), la remise vient de **nos**
 * tables. C'est exactement la frontière : chacun rend ce qu'il observe, et la
 * vue les assemble au dernier moment plutôt qu'une jointure ne les confonde.
 */
@QueryHandler(GetHandoverQuery)
export class GetHandoverHandler implements IQueryHandler<GetHandoverQuery, OrderHandoverView> {
  constructor(
    private readonly subjects: HandoverSubjectReader,
    private readonly handovers: OrderHandoverRepository,
  ) {}

  async execute(query: GetHandoverQuery): Promise<OrderHandoverView> {
    const subject = await this.subjects.byToken(query.token);
    if (subject === null) {
      throw new HandoverTokenNotFoundError();
    }
    return toHandoverView(subject, await this.handovers.findByOrderId(subject.orderId));
  }
}

/** Projette la commande et son attestation en vue de comptoir, refus compris. */
export function toHandoverView(
  subject: HandoverSubject,
  handover: OrderHandover | null,
): OrderHandoverView {
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
    totalUnits: subject.lines.reduce((sum, line) => sum + line.quantity, 0),
    lines: subject.lines,
    handedOverAt: handover === null ? null : handover.handedOverAt.toISOString(),
    handedOverBy: handover === null ? null : handover.handedOverBy,
    handedOverVia: handover === null ? null : handover.via,
    blockedReason: handoverBlocker({
      status: subject.status,
      handedOverAt: handover === null ? null : handover.handedOverAt,
    }),
  };
}
