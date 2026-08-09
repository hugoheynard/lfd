import type { SupportRequestView } from "@lfd/contracts";
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { HandleSupportRequestCommand } from "../application/commands/handle-support-request.command.js";
import { ListSupportRequestsQuery } from "../application/queries/list-support-requests.query.js";

/**
 * Surface **staff** des demandes de contact : la file, et sa clôture.
 *
 * Jusqu'ici le client remplissait un formulaire (canal, numéro, disponibilité,
 * message) qu'aucune surface ne lisait — la vue admin n'en tirait qu'un booléen.
 * Même montage à deux surfaces que les autres `/admin/*`.
 */
@Controller("admin/support-requests")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminSupportController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Les demandes ouvertes par défaut ; `?all=true` rend aussi l'historique. */
  @Get()
  list(@Query("all") all?: string): Promise<readonly SupportRequestView[]> {
    return this.queries.execute<ListSupportRequestsQuery, readonly SupportRequestView[]>(
      new ListSupportRequestsQuery(all !== "true"),
    );
  }

  @Post(":id/handle")
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(@Param("id") id: string): Promise<void> {
    await this.commands.execute<HandleSupportRequestCommand, void>(
      new HandleSupportRequestCommand(id),
    );
  }
}
