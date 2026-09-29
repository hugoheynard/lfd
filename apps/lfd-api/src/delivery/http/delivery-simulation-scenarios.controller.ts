import {
  type CreatedIdResponse,
  type DeliverySimulationScenarioSummaryView,
  type DeliverySimulationScenarioView,
  type SaveDeliverySimulationScenarioPayload,
  saveDeliverySimulationScenarioPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { ArchiveSimulationScenarioCommand } from "../application/commands/archive-simulation-scenario.command.js";
import { DuplicateSimulationScenarioCommand } from "../application/commands/duplicate-simulation-scenario.command.js";
import { RecordSimulationScenarioCommand } from "../application/commands/record-simulation-scenario.command.js";
import { ReplaceSimulationScenarioCommand } from "../application/commands/replace-simulation-scenario.command.js";
import { GetSimulationScenarioQuery } from "../application/queries/get-simulation-scenario.query.js";
import { ListSimulationScenariosQuery } from "../application/queries/list-simulation-scenarios.query.js";

/**
 * **Les scénarios du simulateur** — Livraison → Simulateur
 * (`plan-preparation-de-tournee.md`, lot 9, L9-C7). Lire sous
 * `delivery_rounds:read`, écrire sous `delivery_rounds:write` : le verbe HTTP
 * dit l'action, et il ne ment sur aucune route ici. Il n'injecte que les bus.
 */
@Controller("admin/livraison/simulateur/scenarios")
@AdminSurface("delivery_rounds")
export class DeliverySimulationScenariosController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<readonly DeliverySimulationScenarioSummaryView[]> {
    return this.queries.execute<
      ListSimulationScenariosQuery,
      readonly DeliverySimulationScenarioSummaryView[]
    >(new ListSimulationScenariosQuery());
  }

  /** Un scénario qui ne se relit plus rend un 409 qui le nomme, jamais une 500. */
  @Get(":id")
  read(@Param("id") id: string): Promise<DeliverySimulationScenarioView> {
    return this.queries.execute<GetSimulationScenarioQuery, DeliverySimulationScenarioView>(
      new GetSimulationScenarioQuery(id),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async record(
    @Body(new ZodBody(saveDeliverySimulationScenarioPayloadSchema))
    payload: SaveDeliverySimulationScenarioPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<RecordSimulationScenarioCommand, string>(
      new RecordSimulationScenarioCommand(payload, staffUserId),
    );
    return { id };
  }

  @Put(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async replace(
    @Param("id") id: string,
    @Body(new ZodBody(saveDeliverySimulationScenarioPayloadSchema))
    payload: SaveDeliverySimulationScenarioPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ReplaceSimulationScenarioCommand, void>(
      new ReplaceSimulationScenarioCommand(id, payload, staffUserId),
    );
  }

  @Post(":id/dupliquer")
  @HttpCode(HttpStatus.CREATED)
  async duplicate(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
  ): Promise<CreatedIdResponse> {
    const copyId = await this.commands.execute<DuplicateSimulationScenarioCommand, string>(
      new DuplicateSimulationScenarioCommand(id, staffUserId),
    );
    return { id: copyId };
  }

  @Post(":id/archiver")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param("id") id: string, @StaffUserId() staffUserId: string): Promise<void> {
    await this.commands.execute<ArchiveSimulationScenarioCommand, void>(
      new ArchiveSimulationScenarioCommand(id, staffUserId),
    );
  }
}
