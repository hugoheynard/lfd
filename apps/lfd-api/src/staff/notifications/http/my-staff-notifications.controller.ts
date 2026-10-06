import type { StaffNotificationsSummary, StaffPermission } from "@lfd/contracts";
import { Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSelfSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffPermissions, StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { MarkMyNotificationReadCommand } from "../application/commands/mark-my-notification-read.command.js";
import { GetMyNotificationsQuery } from "../application/queries/get-my-notifications.query.js";

/**
 * **Mes notifications** — celles adressées à un droit que je tiens
 * (`a-la-porte.md`, B5 ; mécanique de `plan-tournee-prete.md`, PL5-D1).
 *
 * Surface RÉFLEXIVE (authentification staff seule) : un livreur sans la
 * cloche partagée doit pouvoir lire ce qui lui est adressé. Le mur n'est pas
 * le garde, c'est la requête : l'effectif de la personne qui appelle, résolu
 * par le guard, entre dans chaque `where` (`audience IN (mes droits)`). Aucun
 * identifiant de cible n'est reçu.
 */
@Controller("admin/me/notifications")
@AdminSelfSurface()
export class MyStaffNotificationsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  summary(
    @StaffPermissions() permissions: readonly StaffPermission[],
  ): Promise<StaffNotificationsSummary> {
    return this.queries.execute<GetMyNotificationsQuery, StaffNotificationsSummary>(
      new GetMyNotificationsQuery(permissions),
    );
  }

  @Post("read")
  @HttpCode(HttpStatus.NO_CONTENT)
  async readAll(
    @StaffPermissions() permissions: readonly StaffPermission[],
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<MarkMyNotificationReadCommand, void>(
      new MarkMyNotificationReadCommand(null, permissions, staffUserId),
    );
  }

  @Post(":id/read")
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(
    @Param("id") id: string,
    @StaffPermissions() permissions: readonly StaffPermission[],
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<MarkMyNotificationReadCommand, void>(
      new MarkMyNotificationReadCommand(id, permissions, staffUserId),
    );
  }
}
