import type { OrderHandoverView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { HandoverSubject } from "../../channels/commerce/handover-subject.reader.js";
import { HandoverSubjectReader } from "../../channels/commerce/handover-subject.reader.js";
import {
  StaffAuthorDirectory,
  type StaffAuthors,
} from "../../../staff/directory/domain/staff-author-directory.js";
import type { OrderHandover } from "../../domain/entities/order-handover.js";
import { HandoverTokenNotFoundError } from "../../domain/errors/handover-errors.js";
import { OrderHandoverRepository } from "../../domain/ports/order-handover.repository.js";
import { handoverBlocker } from "../../domain/services/handover.js";
import { QualityHoldsReader } from "../../../production/channels/handover/index.js";
import { isHeldForQuality } from "../services/quality-hold.js";
import { GetHandoverQuery } from "./get-handover.query.js";

/**
 * L'écran de comptoir : ce que le staff a sous les yeux entre le scan et le
 * bouton de confirmation.
 *
 * Il **répond toujours** quand le jeton existe, même si le retrait est
 * impossible : le refus part avec la commande (`blockedReason`), pas à la place.
 * Une erreur sèche ferait disparaître de l'écran le numéro et le client — les
 * deux seules choses avec lesquelles on peut décrocher un téléphone.
 *
 * ## Deux sources, et c'est la forme normale ici
 *
 * La commande vient du **commerce** (par le port), le retrait vient de **nos**
 * tables. C'est exactement la frontière : chacun rend ce qu'il observe, et la
 * vue les assemble au dernier moment plutôt qu'une jointure ne les confonde.
 */
@QueryHandler(GetHandoverQuery)
export class GetHandoverHandler implements IQueryHandler<GetHandoverQuery, OrderHandoverView> {
  constructor(
    private readonly subjects: HandoverSubjectReader,
    private readonly handovers: OrderHandoverRepository,
    private readonly staffAuthors: StaffAuthorDirectory,
    private readonly holds: QualityHoldsReader,
  ) {}

  async execute(query: GetHandoverQuery): Promise<OrderHandoverView> {
    const subject = await this.subjects.byToken(query.token);
    if (subject === null) {
      throw new HandoverTokenNotFoundError();
    }
    const [handover, qualityHold] = await Promise.all([
      this.handovers.findByOrderId(subject.orderId),
      isHeldForQuality(this.holds, subject),
    ]);
    const authors = await authorsOf(this.staffAuthors, handover);
    return toHandoverView(subject, handover, qualityHold, authors);
  }
}

/**
 * Les auteurs d'une attestation — celui qui a remis le sac, s'il y en a un
 * (`architecture-journalisation.md` §12, D3). Partagé par les trois lectures
 * qui projettent la vue de comptoir.
 */
export function authorsOf(
  directory: StaffAuthorDirectory,
  handover: OrderHandover | null,
): Promise<StaffAuthors> {
  return directory.identify([handover?.handedOverBy ?? null]);
}

/**
 * Projette la commande et son attestation en vue de comptoir, refus compris.
 *
 * `qualityHold` est exigé, pas optionnel : chaque appelant (scan, rail de la
 * file, accusé du geste) doit l'avoir demandé à la production, sinon l'écran
 * dirait « remettable » d'une commande que le scan refuse
 * (`plan-controle-qualite.md`, D4).
 */
export function toHandoverView(
  subject: HandoverSubject,
  handover: OrderHandover | null,
  qualityHold: boolean,
  authors: StaffAuthors,
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
    fulfillmentMethod: subject.fulfillmentMethod,
    note: subject.note,
    totalUnits: subject.lines.reduce((sum, line) => sum + line.quantity, 0),
    lines: subject.lines,
    handedOverAt: handover === null ? null : handover.handedOverAt.toISOString(),
    handedOverBy: handover === null ? null : handover.handedOverBy,
    handedOverByName: handover === null ? null : authors.nameOf(handover.handedOverBy),
    handedOverVia: handover === null ? null : handover.via,
    blockedReason: handoverBlocker({
      status: subject.status,
      handedOverAt: handover === null ? null : handover.handedOverAt,
      qualityHold,
      settled: subject.settled,
    }),
  };
}
