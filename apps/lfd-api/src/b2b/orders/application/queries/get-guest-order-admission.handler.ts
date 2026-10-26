import type { GuestOrderAdmissionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderIntake } from "../services/order-intake.service.js";
import { GetGuestOrderAdmissionQuery } from "./get-guest-order-admission.query.js";

/**
 * **Cette adresse peut-elle commander sans compte ?** — la porte de
 * `PlaceShopOrderHandler` (particulier, sans société), lue sans refus.
 *
 * Un booléen, et rien d'autre (Hugo, 2026-10-26). Boutique ouverte aux
 * particuliers : `true` pour toute adresse, sans lire les exemptions — la
 * réponse ne dit donc quelque chose d'une adresse que boutique fermée.
 */
@QueryHandler(GetGuestOrderAdmissionQuery)
export class GetGuestOrderAdmissionHandler implements IQueryHandler<
  GetGuestOrderAdmissionQuery,
  GuestOrderAdmissionView
> {
  constructor(private readonly intake: OrderIntake) {}

  async execute(query: GetGuestOrderAdmissionQuery): Promise<GuestOrderAdmissionView> {
    const standing = await this.intake.standingFor(null, { email: query.email });
    return { canOrder: standing.canOrder };
  }
}
