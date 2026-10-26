import {
  guestOrderAdmissionPayloadSchema,
  type GuestOrderAdmissionPayload,
  type GuestOrderAdmissionView,
  type MyOrderAdmissionView,
} from "@lfd/contracts";
import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetGuestOrderAdmissionQuery } from "../application/queries/get-guest-order-admission.query.js";
import { GetMyOrderAdmissionQuery } from "../application/queries/get-my-order-admission.query.js";

/**
 * **La boutique prendrait-elle MA commande ?** — doc
 * `documentation/commandes/passation/ouverture-de-la-boutique.md`, « La
 * boutique et les exemptions » (décision de Hugo du 2026-10-26).
 *
 * `GET /order-opening` dit à qui la boutique est ouverte ; il ne peut pas dire
 * qu'un client est exempté sans publier la liste. Ces deux routes répondent
 * pour UNE personne, et le refus lui-même reste à la passation (`OrderIntake`).
 *
 * - `GET mine` — connecté : la société est celle du contexte, résolue en base
 *   depuis les rattachements ; aucun identifiant n'est passé.
 * - `POST guest` `{ email }` — sans compte : un booléen pour cette adresse.
 *   L'adresse voyage dans le corps (jamais dans une URL qu'un journal garde),
 *   et le débit est resserré : 10/min/IP, entre la vitrine (60) et la
 *   passation (5) — de quoi relire après une correction de frappe, pas de quoi
 *   éprouver une liste d'adresses.
 */
@Controller("order-admission")
export class OrderAdmissionController {
  constructor(private readonly queries: QueryBus) {}

  @Get("mine")
  @Header("Cache-Control", "no-store")
  mine(
    @ActingCompany() companyId: string | null,
    @CurrentUser() user: Principal,
  ): Promise<MyOrderAdmissionView> {
    return this.queries.execute<GetMyOrderAdmissionQuery, MyOrderAdmissionView>(
      new GetMyOrderAdmissionQuery(companyId, user.userId),
    );
  }

  @Post("guest")
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  guest(
    @Body(new ZodBody(guestOrderAdmissionPayloadSchema)) payload: GuestOrderAdmissionPayload,
  ): Promise<GuestOrderAdmissionView> {
    return this.queries.execute<GetGuestOrderAdmissionQuery, GuestOrderAdmissionView>(
      new GetGuestOrderAdmissionQuery(payload.email),
    );
  }
}
