import type { DeliveryBinDetailView, DeliveryOrderBinsView } from "@lfd/contracts";
import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface, RequireAnyPermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { VoidDeliveryBinCommand } from "../application/commands/void-delivery-bin.command.js";
import { GetDeliveryBinQuery } from "../application/queries/get-delivery-bin.query.js";
import { GetDeliveryOrderBinsQuery } from "../application/queries/get-delivery-order-bins.query.js";

/** La commande dont on lit les bacs, validée dans sa FORME. */
const orderQuerySchema = z.object({ commande: z.string().trim().min(1, "commande requise") });
type OrderQuery = z.infer<typeof orderQuerySchema>;

/**
 * **Les bacs déclarés** — lire, annuler
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 4,
 * L4-C19, L4-C21 ; lot 4 bis, v2-4, tranche B).
 *
 * 🔴 Déclarer, partager et lister les moitiés libres ne passent plus par ici
 * depuis le 2026-10-10 (`documentation/colisage/colisage.md` §9, voie (b)) :
 * un bac naît au poste de colisage, par `BinDesk`, et les routes
 * `POST`, `POST partage` et `GET partenaires` sont retirées.
 *
 * Sous `admin/livraison/colisage/bacs` : `admin/livraison/bacs` est le
 * CATALOGUE des types (tranche A), un réglage — un bac déclaré est un fait du
 * colisage d'une commande.
 *
 * Sous `delivery_loading` : lecture et écriture pour `admin` et `comptoir`
 * (Q21). Lire un bac ou les bacs d'une commande — la page imprimable, le QR
 * ouvert — n'écrit rien. Il n'injecte que les bus.
 *
 * 🔴 La porte s'ouvre AUSSI au colisage (2026-10-01, `documentation/livraisons/droits/plan-droits-par-geste.md`,
 * 5.3) : chaque route exige `production_packing:write` OU
 * `delivery_loading:write`, sauf la fiche d'un bac (ci-dessous). On élargit la porte, on ne déplace aucun droit —
 * aucune dérogation n'a donc à fusionner.
 *
 * LA FICHE D'UN BAC (`GET :binId`, celle qu'ouvre son QR) se LIT sous
 * `production_packing:read` OU `delivery_loading:read` depuis le 2026-10-02
 * (lot « correctifs de droits ») : l'écran la gardait en lecture, et
 * l'exiger en écriture ici la rendait vide à qui lit. Ce qu'elle rend
 * (référence, nom du client, type et moitié du bac, tournée, véhicule,
 * heures de chargement et de départ) ne dépasse pas ce que le colisage et le
 * chargement montrent déjà en lecture : ni montant, ni contact, ni adresse
 * (vérifié le 2026-10-02 sur `delivery-loading.ts`).
 *
 * L'autre `GET` — les bacs d'une commande — reste en écriture : il est le
 * PANNEAU du geste, que la lecture du
 * colisage n'ouvre pas (plan 5.3 ; `gesture-rights.e2e-spec.ts` le tient).
 */
@Controller("admin/livraison/colisage/bacs")
@AdminSurface("delivery_loading")
export class DeliveryBinsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  @RequireAnyPermission("production_packing:write", "delivery_loading:write")
  orderBins(
    @Query(new ZodQuery(orderQuerySchema)) query: OrderQuery,
  ): Promise<DeliveryOrderBinsView> {
    return this.queries.execute<GetDeliveryOrderBinsQuery, DeliveryOrderBinsView>(
      new GetDeliveryOrderBinsQuery(query.commande),
    );
  }

  @Get(":binId")
  @RequireAnyPermission("production_packing:read", "delivery_loading:read")
  bin(@Param("binId") binId: string): Promise<DeliveryBinDetailView> {
    return this.queries.execute<GetDeliveryBinQuery, DeliveryBinDetailView>(
      new GetDeliveryBinQuery(binId),
    );
  }

  @Post(":binId/annulation")
  @RequireAnyPermission("production_packing:write", "delivery_loading:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  async void(@Param("binId") binId: string): Promise<void> {
    await this.commands.execute<VoidDeliveryBinCommand, void>(new VoidDeliveryBinCommand(binId));
  }
}
