import {
  type CreatedPickupResponse,
  type PickupAddressPayload,
  pickupAddressPayloadSchema,
  type PickupAddressUpdatePayload,
  pickupAddressUpdatePayloadSchema,
  type PublicPickupSchedulePayload,
  publicPickupSchedulePayloadSchema,
  type PublicPickupScheduleView,
  type SiteColorsPayload,
  type SitePaletteView,
  siteColorsPayloadSchema,
  type SiteRolesPayload,
  siteRolesPayloadSchema,
  type SiteView,
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
  Put,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import {
  AdminSurface,
  RequireAnyPermission,
} from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CreatePickupAddressCommand } from "../../pickup-addresses/application/create-pickup-address.command.js";
import { GetPublicPickupScheduleQuery } from "../../pickup-addresses/application/get-public-pickup-schedule.query.js";
import { RemovePickupAddressCommand } from "../../pickup-addresses/application/remove-pickup-address.command.js";
import { SavePublicPickupScheduleCommand } from "../../pickup-addresses/application/save-public-pickup-schedule.command.js";
import { UpdatePickupAddressCommand } from "../../pickup-addresses/application/update-pickup-address.command.js";
import { GetSiteQuery } from "../application/get-site.query.js";
import { GetSitePaletteQuery } from "../application/get-site-palette.query.js";
import { ListSitesQuery } from "../application/list-sites.query.js";
import { SetSiteColorsCommand } from "../application/set-site-colors.command.js";
import { SetSiteRolesCommand } from "../application/set-site-roles.command.js";

/**
 * **Réglages › Sites** — l'API de l'écran, sous `lfc_site_settings` (doc
 * `documentation/sites/sites.md`,
 * §4, lot S1, 2026-10-13).
 *
 * Elle couvre tout ce que la page d'un site règle : lieu, défaut, rôles,
 * couleurs, horaire public, archivage. Les gestes déjà servis réutilisent les
 * commandes des points de retrait — un site EST un point élargi, et un seul
 * handler par geste.
 *
 * 🔴 Geste de bascule : `lfc_site_settings` doit être accordée à l'écran
 * (`/admin/staff-roles`) AVANT que le front n'appelle ces routes. L'ancienne
 * surface `admin/pickup-addresses` (sous `b2b_settings`) reste servie tant
 * que le front ne l'a pas quittée.
 */
@Controller("admin/sites")
@AdminSurface("lfc_site_settings")
export class AdminSitesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<readonly SiteView[]> {
    return this.queries.execute<ListSitesQuery, readonly SiteView[]>(new ListSitesQuery());
  }

  /**
   * **La palette de la logistique** — lecture seule (id, nom, couleurs,
   * départ), sans `lfc_site_settings` : le colisage, le tableau des tournées,
   * le chargement, « Ma tournée » et la liste des Commandes (2026-10-14)
   * peignent leurs commandes (plan
   * `commandes/plan-tri-depart-et-couleurs.md`, L1a). La permission déclarée
   * REMPLACE celle de la ressource de la classe (`StaffAccessGuard`). Déclarée
   * AVANT `:id`, qui l'avalerait sinon.
   */
  @Get("palette")
  @RequireAnyPermission(
    "production_packing:read",
    "delivery_rounds:read",
    "delivery_loading:read",
    "delivery_driving:read",
    "b2b_orders:read",
  )
  palette(): Promise<SitePaletteView> {
    return this.queries.execute<GetSitePaletteQuery, SitePaletteView>(new GetSitePaletteQuery());
  }

  @Get(":id")
  get(@Param("id") id: string): Promise<SiteView> {
    return this.queries.execute<GetSiteQuery, SiteView>(new GetSiteQuery(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodBody(pickupAddressPayloadSchema)) payload: PickupAddressPayload,
  ): Promise<CreatedPickupResponse> {
    const id = await this.commands.execute<CreatePickupAddressCommand, string>(
      new CreatePickupAddressCommand(payload),
    );
    return { id };
  }

  /** Le lieu : adresse, heures pros, remise, GPS. Clientèles absentes = inchangées. */
  @Patch(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param("id") id: string,
    @Body(new ZodBody(pickupAddressUpdatePayloadSchema)) payload: PickupAddressUpdatePayload,
  ): Promise<void> {
    await this.commands.execute<UpdatePickupAddressCommand, void>(
      new UpdatePickupAddressCommand(id, payload),
    );
  }

  /** Les rôles, en bloc : leur cohérence se juge sur l'ensemble. */
  @Put(":id/roles")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setRoles(
    @Param("id") id: string,
    @Body(new ZodBody(siteRolesPayloadSchema)) payload: SiteRolesPayload,
  ): Promise<void> {
    await this.commands.execute<SetSiteRolesCommand, void>(new SetSiteRolesCommand(id, payload));
  }

  /** Les quatre couleurs, en bloc. */
  @Put(":id/couleurs")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setColors(
    @Param("id") id: string,
    @Body(new ZodBody(siteColorsPayloadSchema)) payload: SiteColorsPayload,
  ): Promise<void> {
    await this.commands.execute<SetSiteColorsCommand, void>(new SetSiteColorsCommand(id, payload));
  }

  /** Archiver : plus proposé, toujours résolu par id. Il n'y a pas de suppression. */
  @Post(":id/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RemovePickupAddressCommand, void>(
      new RemovePickupAddressCommand(id),
    );
  }

  @Get(":id/creneaux-publics")
  publicSchedule(@Param("id") id: string): Promise<PublicPickupScheduleView> {
    return this.queries.execute<GetPublicPickupScheduleQuery, PublicPickupScheduleView>(
      new GetPublicPickupScheduleQuery(id),
    );
  }

  @Put(":id/creneaux-publics")
  @HttpCode(HttpStatus.NO_CONTENT)
  async savePublicSchedule(
    @Param("id") id: string,
    @Body(new ZodBody(publicPickupSchedulePayloadSchema)) payload: PublicPickupSchedulePayload,
  ): Promise<void> {
    await this.commands.execute<SavePublicPickupScheduleCommand, void>(
      new SavePublicPickupScheduleCommand(id, payload),
    );
  }
}
