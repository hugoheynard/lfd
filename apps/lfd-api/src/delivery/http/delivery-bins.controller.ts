import {
  type DeclaredDeliveryBinsResponse,
  type DeclareDeliveryBinsPayload,
  type DeliveryBinFreeHalvesView,
  declareDeliveryBinsPayloadSchema,
  type DeliveryBinDetailView,
  type DeliveryOrderBinsView,
  type SharedDeliveryBinResponse,
  type ShareDeliveryBinPayload,
  shareDeliveryBinPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodBody, ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { DeclareDeliveryBinsCommand } from "../application/commands/declare-delivery-bins.command.js";
import { ShareDeliveryBinCommand } from "../application/commands/share-delivery-bin.command.js";
import { VoidDeliveryBinCommand } from "../application/commands/void-delivery-bin.command.js";
import { GetDeliveryBinFreeHalvesQuery } from "../application/queries/get-delivery-bin-free-halves.query.js";
import { GetDeliveryBinQuery } from "../application/queries/get-delivery-bin.query.js";
import { GetDeliveryOrderBinsQuery } from "../application/queries/get-delivery-order-bins.query.js";

/** La commande dont on lit les bacs, validée dans sa FORME. */
const orderQuerySchema = z.object({ commande: z.string().trim().min(1, "commande requise") });
type OrderQuery = z.infer<typeof orderQuerySchema>;

/**
 * **Les bacs déclarés** — déclarer, partager, lire, annuler
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 4, L4-C16,
 * L4-C19, L4-C21 ; lot 4 bis, v2-4, tranche B).
 *
 * Sous `admin/livraison/colisage/bacs` : `admin/livraison/bacs` est le
 * CATALOGUE des types (tranche A), un réglage — un bac déclaré est un fait du
 * colisage d'une commande.
 *
 * Sous `delivery_loading` : lecture et écriture pour `admin` et `comptoir`
 * (Q21). `GET partenaires?commande=` : les moitiés libres autour d'une
 * commande (tranche C). Lire un bac ou les bacs d'une commande — la page imprimable, le QR
 * ouvert — n'écrit rien. Il n'injecte que les bus.
 */
@Controller("admin/livraison/colisage/bacs")
@AdminSurface("delivery_loading")
export class DeliveryBinsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async declare(
    @Body(new ZodBody(declareDeliveryBinsPayloadSchema)) payload: DeclareDeliveryBinsPayload,
  ): Promise<DeclaredDeliveryBinsResponse> {
    const binIds = await this.commands.execute<DeclareDeliveryBinsCommand, readonly string[]>(
      new DeclareDeliveryBinsCommand(payload),
    );
    return { binIds };
  }

  @Post("partage")
  @HttpCode(HttpStatus.CREATED)
  async share(
    @Body(new ZodBody(shareDeliveryBinPayloadSchema)) payload: ShareDeliveryBinPayload,
  ): Promise<SharedDeliveryBinResponse> {
    const binId = await this.commands.execute<ShareDeliveryBinCommand, string>(
      new ShareDeliveryBinCommand(payload),
    );
    return { binId };
  }

  @Get()
  orderBins(
    @Query(new ZodQuery(orderQuerySchema)) query: OrderQuery,
  ): Promise<DeliveryOrderBinsView> {
    return this.queries.execute<GetDeliveryOrderBinsQuery, DeliveryOrderBinsView>(
      new GetDeliveryOrderBinsQuery(query.commande),
    );
  }

  /**
   * Les moitiés libres des arrêts consécutifs de la tournée de la commande
   * (v2-4, tranche C). Déclarée AVANT `:binId`, qui la prendrait sinon pour
   * un identifiant de bac.
   */
  @Get("partenaires")
  freeHalves(
    @Query(new ZodQuery(orderQuerySchema)) query: OrderQuery,
  ): Promise<DeliveryBinFreeHalvesView> {
    return this.queries.execute<GetDeliveryBinFreeHalvesQuery, DeliveryBinFreeHalvesView>(
      new GetDeliveryBinFreeHalvesQuery(query.commande),
    );
  }

  @Get(":binId")
  bin(@Param("binId") binId: string): Promise<DeliveryBinDetailView> {
    return this.queries.execute<GetDeliveryBinQuery, DeliveryBinDetailView>(
      new GetDeliveryBinQuery(binId),
    );
  }

  @Post(":binId/annulation")
  @HttpCode(HttpStatus.NO_CONTENT)
  async void(@Param("binId") binId: string): Promise<void> {
    await this.commands.execute<VoidDeliveryBinCommand, void>(new VoidDeliveryBinCommand(binId));
  }
}
