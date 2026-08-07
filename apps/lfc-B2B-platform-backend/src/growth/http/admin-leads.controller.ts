import {
  type AdvanceLeadStatusPayload,
  advanceLeadStatusPayloadSchema,
  type CaptureLeadPayload,
  captureLeadPayloadSchema,
  type CreatedLeadResponse,
  type LeadView,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { CaptureLeadCommand } from "../application/commands/capture-lead.command.js";
import { ChangeLeadStatusCommand } from "../application/commands/change-lead-status.command.js";
import { ListLeadsQuery } from "../application/queries/list-leads.query.js";

/**
 * Surface **staff** des leads cold (démarchage). Saisir un lead + lister la file.
 * Montage à deux surfaces habituel (`@Public()` désarme le guard client global,
 * `AdminAuthGuard` réarme la porte staff).
 */
@Controller("admin/leads")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminLeadsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<LeadView[]> {
    return this.queries.execute<ListLeadsQuery, LeadView[]>(new ListLeadsQuery());
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async capture(
    @Body(new ZodBody(captureLeadPayloadSchema)) payload: CaptureLeadPayload,
  ): Promise<CreatedLeadResponse> {
    const id = await this.commands.execute<CaptureLeadCommand, string>(
      new CaptureLeadCommand(payload),
    );
    return { id };
  }

  @Patch(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeStatus(
    @Param("id") id: string,
    @Body(new ZodBody(advanceLeadStatusPayloadSchema)) payload: AdvanceLeadStatusPayload,
  ): Promise<void> {
    await this.commands.execute<ChangeLeadStatusCommand, void>(
      new ChangeLeadStatusCommand(id, payload.status),
    );
  }
}
