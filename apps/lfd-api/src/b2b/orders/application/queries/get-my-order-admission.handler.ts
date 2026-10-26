import type { MyOrderAdmissionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderIntake } from "../services/order-intake.service.js";
import { GetMyOrderAdmissionQuery } from "./get-my-order-admission.query.js";

/**
 * **« Fermée, mais vous pouvez commander »** — la porte de la passation
 * ({@link OrderIntake}) lue sans refus, pour que la boutique ne cache pas le
 * bouton d'un client exempté (décision de Hugo du 2026-10-26, option A).
 *
 * Ne rend que deux booléens : ni la clientèle, ni la liste des exemptions, ni
 * laquelle couvre la personne. Lecture pure.
 */
@QueryHandler(GetMyOrderAdmissionQuery)
export class GetMyOrderAdmissionHandler implements IQueryHandler<
  GetMyOrderAdmissionQuery,
  MyOrderAdmissionView
> {
  constructor(private readonly intake: OrderIntake) {}

  async execute(query: GetMyOrderAdmissionQuery): Promise<MyOrderAdmissionView> {
    const standing = await this.intake.standingFor(query.companyId, { userId: query.userId });
    return { ordersOpen: standing.ordersOpen, canOrder: standing.canOrder };
  }
}
