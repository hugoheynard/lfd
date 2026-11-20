import {
  counterParticularCreatePayloadSchema,
  counterParticularSearchQuerySchema,
  type CounterParticularCard,
  type CounterParticularCreatePayload,
  type CounterParticularSearchQuery,
  type CreatedIdResponse,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { RegisterCounterParticularCommand } from "../application/commands/register-counter-particular.command.js";
import { SearchCounterParticularsQuery } from "../application/queries/search-counter-particulars.query.js";

/**
 * Surface de la **saisie particulier au comptoir** : retrouver LA personne, ou
 * inscrire sa fiche explicitement
 * (`documentation/commandes/passation/commande-particulier-reglee-en-boutique.md`, § 3).
 *
 * Chaque route exige le droit de passation de l'équipe
 * (`b2b_place_order:write`), celui de la saisie pro : chercher un particulier
 * n'a de sens que pour lui noter une commande.
 */
@Controller("admin/counter/particulars")
@AdminSurface("b2b_counter")
export class AdminCounterParticularsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** Au plus dix particuliers, coordonnées masquées. */
  @Get()
  @RequirePermission("b2b_place_order:write")
  search(
    @Query(new ZodQuery(counterParticularSearchQuerySchema)) query: CounterParticularSearchQuery,
  ): Promise<readonly CounterParticularCard[]> {
    return this.queries.execute<SearchCounterParticularsQuery, readonly CounterParticularCard[]>(
      new SearchCounterParticularsQuery(query.q),
    );
  }

  /**
   * Une fiche invitée neuve — 409 si l'adresse ou le téléphone est déjà celui
   * d'un particulier. Une fois par intention (`Idempotency-Key`).
   */
  @Post()
  @RequirePermission("b2b_place_order:write")
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodBody(counterParticularCreatePayloadSchema))
    payload: CounterParticularCreatePayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<RegisterCounterParticularCommand, string>(
      new RegisterCounterParticularCommand(staffUserId, payload, intentKey),
    );
    return { id };
  }
}
