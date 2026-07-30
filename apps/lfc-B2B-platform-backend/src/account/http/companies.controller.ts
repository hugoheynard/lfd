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
 * Aucune liste ici : les entreprises d'une personne font partie de son compte et
 * se lisent par `GET /me`. Un `GET /companies` dupliquerait cette lecture sans
 * second consommateur pour le justifier.
 *
 * Pas de garde de rôle non plus : n'importe quelle personne authentifiée peut
 * déclarer **sa** société, et en devient le gestionnaire. Les gardes de rôle
 * viendront sur les opérations qui touchent une société **existante**.
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
