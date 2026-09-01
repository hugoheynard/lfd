import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import type { StaffNotificationsSummary } from "@lfd/contracts";
import { Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { StaffSub } from "../../../platform/auth/staff.decorator.js";
import { MarkNotificationReadCommand } from "../application/commands/mark-notification-read.command.js";
import { GetStaffNotificationsQuery } from "../application/queries/get-staff-notifications.query.js";

/**
 * La **cloche** du back-office.
 *
 * Commune à l'équipe : une notification traitée par l'un n'a pas à rester en
 * attente chez les autres. `readBy` dit qui s'en est chargé.
 */
@Controller("admin/notifications")
@AdminSurface("staff_notifications")
export class AdminStaffNotificationsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  async summary(): Promise<StaffNotificationsSummary> {
    return this.queries.execute<GetStaffNotificationsQuery, StaffNotificationsSummary>(
      new GetStaffNotificationsQuery(),
    );
  }

  @Post("read")
  @HttpCode(HttpStatus.NO_CONTENT)
  async readAll(@StaffSub() staffSub: string): Promise<void> {
    await this.commands.execute<MarkNotificationReadCommand, void>(
      new MarkNotificationReadCommand(null, staffSub),
    );
  }

  @Post(":id/read")
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(@Param("id") id: string, @StaffSub() staffSub: string): Promise<void> {
    await this.commands.execute<MarkNotificationReadCommand, void>(
      new MarkNotificationReadCommand(id, staffSub),
    );
  }
}
