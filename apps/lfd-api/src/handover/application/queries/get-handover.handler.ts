import type { OrderHandoverView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { HandoverSubjectReader } from "../../channels/commerce/handover-subject.reader.js";
import { HandoverTokenNotFoundError } from "../../domain/errors/handover-errors.js";
import { HandoverCounterView } from "../services/handover-counter-view.js";
import { GetHandoverQuery } from "./get-handover.query.js";

/**
 * L'écran de comptoir : ce que le staff a sous les yeux entre le scan et le
 * bouton de confirmation.
 *
 * Le jeton est un par COMMANDE (plan E7 reliquat, choix 13) : il résout la
 * commande, puis la vue rend les envois prêts et pas encore retirés — un seul,
 * l'écran d'avant ; deux, la liste à cocher. Le refus part avec la commande
 * (`blockedReason`), jamais à sa place.
 */
@QueryHandler(GetHandoverQuery)
export class GetHandoverHandler implements IQueryHandler<GetHandoverQuery, OrderHandoverView> {
  constructor(
    private readonly subjects: HandoverSubjectReader,
    private readonly counter: HandoverCounterView,
  ) {}

  async execute(query: GetHandoverQuery): Promise<OrderHandoverView> {
    const subject = await this.subjects.byToken(query.token);
    if (subject === null) {
      throw new HandoverTokenNotFoundError();
    }
    return this.counter.viewOf(subject);
  }
}
