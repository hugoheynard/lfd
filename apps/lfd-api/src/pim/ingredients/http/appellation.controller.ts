import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  createAppellationPayloadSchema,
  updateAppellationPayloadSchema,
  type AppellationView,
  type CreateAppellationPayload,
  type UpdateAppellationPayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  CreateAppellationCommand,
  RemoveAppellationCommand,
  UpdateAppellationCommand,
} from "../application/appellation-handlers.js";
import { ListAppellationsQuery } from "../application/list-appellations.js";

/**
 * Les **appellations** — les signes de qualité et d'origine qu'une matière peut
 * porter (AOP, IGP, Label Rouge…), en lecture et en écriture.
 *
 * Séparé de {@link IngredientController} : ce sont deux référentiels, donc deux
 * raisons de changer. Une appellation est un signe **officiel** dont le code est
 * une identité gelée et le régime (`scheme`) un fait réglementaire ; un
 * ingrédient est une matière que l'atelier nomme comme il l'entend. Rien de ce
 * qui fait bouger l'un ne fait bouger l'autre.
 *
 * Le back-office les ouvre d'ailleurs par deux routes distinctes
 * (`pim/ingredients` et `pim/appellations`, cf. `pim.routes.ts`) : la fusion
 * historique de ces deux surfaces sous un seul contrôleur ne correspondait à
 * aucun écran.
 *
 * ⚠️ Une appellation n'est pas une mention obligatoire au sens du règlement UE
 * 1169/2011. Cf. `documentation/pim/ingredients-et-appellations.md`.
 */
@AdminSurface("pim_catalog")
@Controller("appellations")
export class AppellationController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<AppellationView[]> {
    return this.queries.execute<ListAppellationsQuery, AppellationView[]>(
      new ListAppellationsQuery(),
    );
  }

  @Post()
  async create(@Body(new ZodBody(createAppellationPayloadSchema)) body: CreateAppellationPayload) {
    const code = await this.commands.execute<CreateAppellationCommand, string>(
      new CreateAppellationCommand(body),
    );
    return { code };
  }

  @Put(":code")
  async update(
    @Param("code") code: string,
    @Body(new ZodBody(updateAppellationPayloadSchema)) body: UpdateAppellationPayload,
  ) {
    await this.commands.execute<UpdateAppellationCommand, void>(
      new UpdateAppellationCommand(code, body),
    );
    return { code };
  }

  @Delete(":code")
  async remove(@Param("code") code: string) {
    await this.commands.execute<RemoveAppellationCommand, void>(new RemoveAppellationCommand(code));
    return { code };
  }
}
