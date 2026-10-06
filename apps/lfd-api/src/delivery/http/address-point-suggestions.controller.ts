import {
  type AddressPointDecisionPayload,
  addressPointDecisionPayloadSchema,
  type AddressPointSuggestionsView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { ApplyAddressPointSuggestionCommand } from "../application/commands/apply-address-point-suggestion.command.js";
import { IgnoreAddressPointSuggestionCommand } from "../application/commands/ignore-address-point-suggestion.command.js";
import { GetAddressPointSuggestionsQuery } from "../application/queries/get-address-point-suggestions.query.js";

/**
 * **« Carnet à corriger »** (`documentation/livraisons/gps-y-aller-et-position.md`,
 * §6) — les portes et les stationnements que les livraisons suggèrent.
 *
 * Sous `delivery_rounds`, et **en écriture même pour lire** : ce qui sort est
 * tiré des positions des livreurs, et seul qui organise les tournées les voit
 * (décision du 2026-10-06). `delivery_rounds:read` voit les tournées, pas
 * l'endroit où des livreurs se sont arrêtés. Il n'injecte que les bus.
 */
@Controller("admin/livraison/carnet-a-corriger")
@AdminSurface("delivery_rounds")
export class AddressPointSuggestionsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  @RequirePermission("delivery_rounds:write")
  suggestions(): Promise<AddressPointSuggestionsView> {
    return this.queries.execute<GetAddressPointSuggestionsQuery, AddressPointSuggestionsView>(
      new GetAddressPointSuggestionsQuery(),
    );
  }

  /** « Appliquer » — 204 ; 409 si la suggestion a changé depuis l'affichage. */
  @Post(":addressId/appliquer")
  @HttpCode(HttpStatus.NO_CONTENT)
  async apply(
    @StaffUserId() staffUserId: string,
    @Param("addressId") addressId: string,
    @Body(new ZodBody(addressPointDecisionPayloadSchema)) payload: AddressPointDecisionPayload,
  ): Promise<void> {
    await this.commands.execute<ApplyAddressPointSuggestionCommand, void>(
      new ApplyAddressPointSuggestionCommand(staffUserId, addressId, payload.kind, payload.point),
    );
  }

  /** « Ignorer » — 204 ; 409 si la suggestion a changé depuis l'affichage. */
  @Post(":addressId/ignorer")
  @HttpCode(HttpStatus.NO_CONTENT)
  async ignore(
    @StaffUserId() staffUserId: string,
    @Param("addressId") addressId: string,
    @Body(new ZodBody(addressPointDecisionPayloadSchema)) payload: AddressPointDecisionPayload,
  ): Promise<void> {
    await this.commands.execute<IgnoreAddressPointSuggestionCommand, void>(
      new IgnoreAddressPointSuggestionCommand(staffUserId, addressId, payload.kind, payload.point),
    );
  }
}
