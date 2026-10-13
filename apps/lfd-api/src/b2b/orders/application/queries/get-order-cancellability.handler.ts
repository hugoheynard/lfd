import type { OrderCancellability } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { CustomerCancellationSubjectReader } from "../../domain/ports/customer-cancellation-subject.reader.js";
import { CancellationWall } from "../services/cancellation-wall.js";
import { CustomerCancellability } from "../services/customer-cancellability.js";
import { GetOrderCancellabilityQuery } from "./get-order-cancellability.query.js";

/**
 * **L'annulabilité vue du client connecté** (plan, C6.8). Lecture pure, sans
 * verrou. Appelée APRÈS `GetOrderQuery`, qui a déjà appliqué le mur de
 * VISIBILITÉ ; ce qui reste à dire ici est le mur d'ANNULATION, plus strict
 * (C6.2, B2) : visible mais pas annulable par ce compte → `not_allowed`, et
 * le bouton disparaît.
 */
@QueryHandler(GetOrderCancellabilityQuery)
export class GetOrderCancellabilityHandler implements IQueryHandler<
  GetOrderCancellabilityQuery,
  OrderCancellability
> {
  constructor(
    private readonly subjects: CustomerCancellationSubjectReader,
    private readonly wall: CancellationWall,
    private readonly cancellability: CustomerCancellability,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetOrderCancellabilityQuery): Promise<OrderCancellability> {
    const subject = await this.subjects.find(query.orderId);
    if (subject === null) {
      throw new OrderNotFoundError(query.orderId);
    }
    const allowed = (await this.wall.mayCancel(subject, query.userId)) ? true : "not_allowed";
    return this.cancellability.of(subject, this.clock.now(), allowed);
  }
}
