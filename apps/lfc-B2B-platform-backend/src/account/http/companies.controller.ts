import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../infra/auth/current-user.decorator.js";
import type { Principal } from "../../infra/auth/principal.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { CreateCompanyCommand } from "../application/commands/create-company.command.js";
import { createCompanyPayload, type CreateCompanyPayload } from "./payloads.js";

/** Ce que la création renvoie : de quoi router, rien de plus. */
export interface CreatedCompanyResponse {
  readonly id: string;
}

/**
 * `POST /companies` — déclarer une entreprise depuis « Mes entreprises ».
 *
 * Ce contrôleur ne fait **que** la création : les opérations sur une entreprise
 * existante (contacts, KBIS) vivent dans leurs propres sous-contrôleurs
 * (`CompanyContactsController`, `CompanyKbisController`), une responsabilité par
 * fichier. Il ne porte pas de logique : il dispatche la commande au
 * `CreateCompanyHandler` via le bus.
 *
 * Pas de garde de rôle sur la création : n'importe quelle personne authentifiée
 * déclare la sienne et en devient gestionnaire.
 */
@Controller("companies")
export class CompaniesController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(createCompanyPayload)) payload: CreateCompanyPayload,
  ): Promise<CreatedCompanyResponse> {
    const id = await this.commands.execute<CreateCompanyCommand, string>(
      new CreateCompanyCommand(
        user.userId,
        payload.raisonSociale,
        payload.enseigne,
        payload.formeJuridique,
        payload.siret,
        payload.tvaIntracom,
      ),
    );
    return { id };
  }
}
