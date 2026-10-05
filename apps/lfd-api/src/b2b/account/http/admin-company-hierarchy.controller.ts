import {
  attachToParentPayloadSchema,
  collectionFormPayloadSchema,
  createSubAccountPayloadSchema,
  followAspectPayloadSchema,
  groupWithoutDeliveryPayloadSchema,
  hasStaffPermission,
  type AttachToParentPayload,
  type CollectionFormPayload,
  type CreatedIdResponse,
  type CreateSubAccountPayload,
  type FollowAspectPayload,
  type GroupWithoutDeliveryPayload,
  type StaffPermission,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffPermissions } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AttachToParentCommand } from "../application/commands/attach-to-parent.command.js";
import { CreateSubAccountCommand } from "../application/commands/create-sub-account.command.js";
import { DetachFromParentCommand } from "../application/commands/detach-from-parent.command.js";
import { FollowParentCommand } from "../application/commands/follow-parent.command.js";
import { SetCollectionFormCommand } from "../application/commands/set-collection-form.command.js";
import { SetGroupWithoutDeliveryCommand } from "../application/commands/set-group-without-delivery.command.js";
import { StopFollowingParentCommand } from "../application/commands/stop-following-parent.command.js";

/**
 * **Les sous-comptes, depuis la fiche client** (plan `plan-sous-comptes.md`,
 * lot S1) : créer, rattacher, détacher, suivre la facturation ou les contacts
 * du principal, et la case « Compte de groupe ».
 *
 * Le droit est celui de la fiche client (`b2b_companies`, §5). Suivre le
 * TARIF n'est pas ici : c'est une décision de tarification, sur sa propre
 * surface (`AdminCompanyPricingFollowController`, Q9). La lecture se fait par
 * la fiche (`GET /admin/companies/:companyId`), qui porte `hierarchy`.
 */
@Controller("admin/companies/:companyId")
@AdminSurface("b2b_companies")
export class AdminCompanyHierarchyController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * Crée un sous-compte de `:companyId`. Il naît `pending`. `pricing` dans les
   * aspects initiaux exige en plus le droit de tarification en écriture (Q9) :
   * sans lui, `403`.
   */
  @Post("sub-accounts")
  @HttpCode(HttpStatus.CREATED)
  async createSubAccount(
    @Param("companyId") parentId: string,
    @StaffPermissions() permissions: readonly StaffPermission[],
    @Body(new ZodBody(createSubAccountPayloadSchema)) payload: CreateSubAccountPayload,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<CreateSubAccountCommand, string>(
      new CreateSubAccountCommand(
        parentId,
        payload,
        hasStaffPermission(permissions, "b2b_pricing:write"),
      ),
    );
    return { id };
  }

  /** Rattache `:companyId` comme sous-compte de `parentId`. `409` si la profondeur passerait 1. */
  @Post("parent")
  @HttpCode(HttpStatus.NO_CONTENT)
  async attach(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(attachToParentPayloadSchema)) payload: AttachToParentPayload,
  ): Promise<void> {
    await this.commands.execute<AttachToParentCommand, void>(
      new AttachToParentCommand(companyId, payload.parentId),
    );
  }

  /**
   * Détache `:companyId` de son principal. `POST` et non `DELETE` : rien n'est
   * supprimé, les périodes de suivi se ferment et restent lisibles.
   */
  @Post("parent/detach")
  @HttpCode(HttpStatus.NO_CONTENT)
  async detach(@Param("companyId") companyId: string): Promise<void> {
    await this.commands.execute<DetachFromParentCommand, void>(
      new DetachFromParentCommand(companyId),
    );
  }

  /** Suivre la facturation ou les contacts du principal. */
  @Post("follows")
  @HttpCode(HttpStatus.NO_CONTENT)
  async follow(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(followAspectPayloadSchema)) payload: FollowAspectPayload,
  ): Promise<void> {
    await this.commands.execute<FollowParentCommand, void>(
      new FollowParentCommand(companyId, payload.aspect),
    );
  }

  /** Cesser de suivre la facturation ou les contacts du principal. */
  @Post("follows/stop")
  @HttpCode(HttpStatus.NO_CONTENT)
  async stopFollowing(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(followAspectPayloadSchema)) payload: FollowAspectPayload,
  ): Promise<void> {
    await this.commands.execute<StopFollowingParentCommand, void>(
      new StopFollowingParentCommand(companyId, payload.aspect),
    );
  }

  /** La case « Compte de groupe, sans livraison » (§4). */
  @Post("group-without-delivery")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setGroupWithoutDelivery(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(groupWithoutDeliveryPayloadSchema)) payload: GroupWithoutDeliveryPayload,
  ): Promise<void> {
    await this.commands.execute<SetGroupWithoutDeliveryCommand, void>(
      new SetGroupWithoutDeliveryCommand(companyId, payload.enabled),
    );
  }

  /**
   * La forme de prélèvement d'un site qui suit `billing` (plan-sous-comptes
   * §2.1 ter) : décision datée, à l'instant du geste. `409` si le site paie
   * seul. Le client la choisira lui-même plus tard ; le staff peut la régler.
   */
  @Put("collection-form")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setCollectionForm(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(collectionFormPayloadSchema)) payload: CollectionFormPayload,
  ): Promise<void> {
    await this.commands.execute<SetCollectionFormCommand, void>(
      new SetCollectionFormCommand(companyId, payload.form),
    );
  }
}
