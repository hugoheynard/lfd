import type { CounterIncompleteHandoverView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CounterHandoverPreviewReader } from "../../../../handover/channels/commerce/index.js";
import { ShortfallPreviewReader } from "../../../../packing/channels/commerce/index.js";
import { FIRST_SHIPMENT_RANK } from "../../../../production/channels/commerce/index.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { CounterShortfallDecisionReader } from "../../domain/ports/counter-shortfall-decision.reader.js";
import { ShortfallDecisionSubjectReader } from "../../domain/ports/shortfall-decision-subject.reader.js";
import {
  counterIncompleteHandoverPreviewOf,
  showsDecidedDeparture,
  withDecidedDeparture,
} from "../services/counter-incomplete-handover-preview.js";
import { GetCounterIncompleteHandoverQuery } from "./get-counter-incomplete-handover.query.js";

/**
 * **Peut-on proposer un départ incomplet, et sinon pourquoi ?** (lot C1b,
 * plan `documentation/commandes/reliquat/depart-incomplet.md`, §4.1 —
 * Hugo, 2026-11-03). Le dialogue du comptoir (C2) dit les refus AVANT le
 * geste, et montre ce qui partirait et ce qui ne partirait pas.
 *
 * Trois lectures sans verrou, chacune par le bloc qui tient la règle : le
 * retrait (portée du comptoir, remise), le commerce (la commande), le
 * colisage (le bac). Le bac n'est pas lu pour une commande hors de portée du
 * comptoir. Rien n'est écrit.
 *
 * Quand le départ est déjà tranché (`already_decided`, `already_authorized`),
 * une quatrième lecture rend la décision — qui, quand, quoi — et l'annuaire
 * nomme son auteur (Hugo, 2026-11-03).
 *
 * @throws {OrderNotFoundError} commande inconnue.
 */
@QueryHandler(GetCounterIncompleteHandoverQuery)
export class GetCounterIncompleteHandoverHandler implements IQueryHandler<
  GetCounterIncompleteHandoverQuery,
  CounterIncompleteHandoverView
> {
  constructor(
    private readonly subjects: ShortfallDecisionSubjectReader,
    private readonly counter: CounterHandoverPreviewReader,
    private readonly bins: ShortfallPreviewReader,
    private readonly decisions: CounterShortfallDecisionReader,
    private readonly staff: StaffAuthorDirectory,
  ) {}

  async execute(query: GetCounterIncompleteHandoverQuery): Promise<CounterIncompleteHandoverView> {
    const { orderId } = query;
    const subject = await this.subjects.subjectOf(orderId, FIRST_SHIPMENT_RANK);
    if (subject === null) {
      throw new OrderNotFoundError(orderId);
    }
    const counter = await this.counter.previewOf(orderId);
    const bin =
      counter.kind === "out_of_reach"
        ? null
        : await this.bins.previewOf(orderId, FIRST_SHIPMENT_RANK);
    const view = counterIncompleteHandoverPreviewOf(orderId, { subject, counter, bin });
    if (!showsDecidedDeparture(view)) {
      return view;
    }
    const decided = await this.decisions.decisionOf(orderId, FIRST_SHIPMENT_RANK);
    const authors = await this.staff.identify([decided?.decidedBy ?? null]);
    return withDecidedDeparture(view, decided, authors.nameOf(decided?.decidedBy ?? null));
  }
}
