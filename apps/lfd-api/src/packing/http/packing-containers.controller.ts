import {
  type DeliveryBinFreeHalvesView,
  type DeliveryPackingProposalView,
  type MovePackingPieces,
  type OpenedPackingContainer,
  type OpenPackingContainer,
  movePackingPiecesSchema,
  openPackingContainerSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { ApplyPackingProposalCommand } from "../application/containers/apply-packing-proposal.command.js";
import { GetShareableHalvesQuery } from "../application/containers/get-shareable-halves.query.js";
import { AllocateToContainerCommand } from "../application/containers/allocate-to-container.command.js";
import { GetPackingProposalQuery } from "../application/containers/get-packing-proposal.query.js";
import { OpenPackingContainerCommand } from "../application/containers/open-packing-container.command.js";
import { VoidPackingContainerCommand } from "../application/containers/void-packing-container.command.js";
import { WithdrawFromContainerCommand } from "../application/containers/withdraw-from-container.command.js";
import { packingDayOf as dayOf } from "./packing-day-path.js";

/** Le code de retour d'un geste qui n'a rien à rendre — le client relit le poste. */
const NO_CONTENT = 204;

/**
 * **La colonne Contenants du poste de colisage** (K2b,
 * `colisage/plan-les-bacs-au-colisage.md` §5–§5.1) : créer un bac ou un sac,
 * y glisser une quantité d'une ligne, l'en ressortir, annuler un contenant,
 * proposer un colisage et l'appliquer, lister les moitiés partageables.
 *
 * Sous `production_packing` : le droit de qui tient le poste — `write` pour
 * les gestes, `read` pour la proposition. Aucun droit neuf, aucun rôle touché.
 *
 * Le poste se RELIT par `GET admin/packing/:date/board` (K3a — le fournil
 * sert encore `GET admin/production/packing?date=` jusqu'à K3c) : ces routes
 * ne rendent rien d'autre qu'un identifiant de contenant.
 *
 * Il n'injecte que des bus — `lint:controller-buses`.
 */
@Controller("admin/packing/:date/orders/:orderId")
@AdminSurface("production_packing")
export class PackingContainersController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Un contenant de plus : un sac, un bac neuf, ou l'autre moitié d'un bac partagé. */
  @Post("containers")
  async open(
    @Param("date") date: string,
    @Param("orderId") orderId: string,
    @Body(new ZodBody(openPackingContainerSchema)) body: OpenPackingContainer,
    @StaffUserId() staffUserId: string,
  ): Promise<OpenedPackingContainer> {
    const containerId = await this.commands.execute<OpenPackingContainerCommand, string>(
      new OpenPackingContainerCommand(dayOf(date), orderId, body, staffUserId),
    );
    return { containerId };
  }

  /**
   * **Glisser** une quantité d'une ligne dans un contenant. `POST` : deux
   * gestes font deux fois la quantité, comme deux poignées de croissants.
   */
  @Post("containers/:containerId/lines/:sku")
  @HttpCode(NO_CONTENT)
  async allocate(
    @Param("date") date: string,
    @Param("orderId") orderId: string,
    @Param("containerId") containerId: string,
    @Param("sku") sku: string,
    @Body(new ZodBody(movePackingPiecesSchema)) body: MovePackingPieces,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<AllocateToContainerCommand, void>(
      new AllocateToContainerCommand(
        dayOf(date),
        orderId,
        containerId,
        sku,
        body.quantity,
        staffUserId,
      ),
    );
  }

  /** **Retirer** une quantité d'une ligne d'un contenant, tant que la commande est ouverte. */
  @Post("containers/:containerId/lines/:sku/withdrawal")
  @HttpCode(NO_CONTENT)
  async withdraw(
    @Param("date") date: string,
    @Param("orderId") orderId: string,
    @Param("containerId") containerId: string,
    @Param("sku") sku: string,
    @Body(new ZodBody(movePackingPiecesSchema)) body: MovePackingPieces,
  ): Promise<void> {
    await this.commands.execute<WithdrawFromContainerCommand, void>(
      new WithdrawFromContainerCommand(dayOf(date), orderId, containerId, sku, body.quantity),
    );
  }

  /** **Annuler** un contenant — un bac s'annule d'abord chez la livraison. */
  @Post("containers/:containerId/void")
  @HttpCode(NO_CONTENT)
  async void(
    @Param("date") date: string,
    @Param("orderId") orderId: string,
    @Param("containerId") containerId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<VoidPackingContainerCommand, void>(
      new VoidPackingContainerCommand(dayOf(date), orderId, containerId, staffUserId),
    );
  }

  /** **« Proposer »** — la proposition de la livraison ; une lecture. */
  @Get("proposal")
  async proposal(
    @Param("date") date: string,
    @Param("orderId") orderId: string,
  ): Promise<DeliveryPackingProposalView> {
    dayOf(date);
    return this.queries.execute<GetPackingProposalQuery, DeliveryPackingProposalView>(
      new GetPackingProposalQuery(orderId),
    );
  }

  /**
   * **Appliquer « Proposer »** d'un coup : les bacs proposés naissent chez la
   * livraison et se remplissent bac par bac, de ce qui est sorti du four, dans
   * une seule transaction. Refusé sur une commande qui a déjà des contenants.
   */
  @Post("proposal/apply")
  @HttpCode(NO_CONTENT)
  async applyProposal(
    @Param("date") date: string,
    @Param("orderId") orderId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ApplyPackingProposalCommand, void>(
      new ApplyPackingProposalCommand(dayOf(date), orderId, staffUserId),
    );
  }

  /** Les moitiés libres des arrêts voisins, à partager — une lecture. */
  @Get("shareable-halves")
  async shareableHalves(
    @Param("date") date: string,
    @Param("orderId") orderId: string,
  ): Promise<DeliveryBinFreeHalvesView> {
    dayOf(date);
    return this.queries.execute<GetShareableHalvesQuery, DeliveryBinFreeHalvesView>(
      new GetShareableHalvesQuery(orderId),
    );
  }
}
