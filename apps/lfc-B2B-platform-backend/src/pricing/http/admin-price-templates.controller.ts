import {
  applyPriceTemplatePayloadSchema,
  priceTemplateKindSchema,
  savePriceTemplatePayloadSchema,
  type ApplyPriceTemplatePayload,
  type PriceTemplateView,
  type SavePriceTemplatePayload,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../infra/auth/admin-surface.decorator.js";
import { StaffSub } from "../../infra/auth/staff.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import {
  ApplyPriceTemplateCommand,
  SavePriceTemplateCommand,
} from "../application/commands/price-template.handlers.js";
import { PriceTemplatesQuery } from "../application/queries/price-templates.query.js";

/**
 * **Les gabarits tarifaires** — mercuriales et devis, même surface.
 *
 * Une seule famille de routes pour les deux, parce qu'ils portent exactement la
 * même chose : une grille de prix. Ce qui les sépare est l'usage — l'un se POSE
 * chez un client, l'autre alimente une estimation — et cela se joue au moment
 * d'agir, pas au moment de ranger.
 */
@Controller("admin/pricing/templates")
@AdminSurface("settings")
export class AdminPriceTemplatesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly templates: PriceTemplatesQuery,
  ) {}

  @Get()
  async list(@Query("kind") kind: string): Promise<readonly PriceTemplateView[]> {
    return this.templates.list(priceTemplateKindSchema.parse(kind));
  }

  @Get(":id")
  async byId(@Param("id") id: string): Promise<PriceTemplateView> {
    const template = await this.templates.byId(id);
    if (template === null) {
      throw new NotFoundException("Gabarit tarifaire introuvable.");
    }
    return template;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async compose(
    @Body(new ZodBody(savePriceTemplatePayloadSchema)) payload: SavePriceTemplatePayload,
    @StaffSub() staffSub: string,
  ): Promise<{ id: string }> {
    const id = await this.commands.execute<SavePriceTemplateCommand, string>(
      new SavePriceTemplateCommand(null, payload, staffSub),
    );
    return { id };
  }

  /**
   * **Réviser** — `PUT` et non `PATCH` : une grille se remplace entière.
   *
   * C'est le seul objet de ce contexte qui se retouche, et c'est justifié : un
   * gabarit n'a **jamais facturé**. Les mercuriales qu'il a posées, elles, sont
   * des décisions closes ; les réviser ne les touche pas.
   */
  @Put(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revise(
    @Param("id") id: string,
    @Body(new ZodBody(savePriceTemplatePayloadSchema)) payload: SavePriceTemplatePayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<SavePriceTemplateCommand, string>(
      new SavePriceTemplateCommand(id, payload, staffSub),
    );
  }

  /**
   * **Poser le gabarit chez un client.** Rend le nombre de règles posées : une
   * grille de trente lignes à deux paliers en pose soixante, et « appliqué » sans
   * chiffre laisserait croire qu'une ligne vaut une règle.
   */
  @Post(":id/apply")
  @HttpCode(HttpStatus.CREATED)
  async apply(
    @Param("id") id: string,
    @Body(new ZodBody(applyPriceTemplatePayloadSchema)) payload: ApplyPriceTemplatePayload,
    @StaffSub() staffSub: string,
  ): Promise<{ posedRules: number }> {
    const posedRules = await this.commands.execute<ApplyPriceTemplateCommand, number>(
      new ApplyPriceTemplateCommand(id, payload, staffSub),
    );
    return { posedRules };
  }
}
