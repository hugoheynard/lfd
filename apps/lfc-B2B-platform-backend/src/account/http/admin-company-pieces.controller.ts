import {
  type BillingAddressPayload,
  billingAddressPayloadSchema,
  type CompanyStatusPayload,
  companyStatusPayloadSchema,
  type CreatedAddressResponse,
  type DeliveryAddressPayload,
  deliveryAddressPayloadSchema,
  type UpdateIdentityPayload,
  updateIdentityPayloadSchema,
  type GrantTermsPayload,
  grantTermsPayloadSchema,
  type FulfillmentPreferencePayload,
  fulfillmentPreferencePayloadSchema,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Delete,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CommandBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { StaffSub } from "../../infra/auth/staff.decorator.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { ChangeCompanyStatusCommand } from "../application/commands/change-company-status.command.js";
import { ActivateCompanyByStaffCommand } from "../application/commands/activate-company.command.js";
import {
  CertifyKbisCommand,
  RevokeKbisCertificationCommand,
} from "../application/commands/certify-kbis.command.js";
import {
  AddDeliveryAddressByStaffCommand,
  SaveBillingAddressByStaffCommand,
  GrantTermsCommand,
  PreferFulfillmentByStaffCommand,
  RemoveDeliveryAddressByStaffCommand,
  SetDefaultDeliveryByStaffCommand,
  UpdateDeliveryAddressByStaffCommand,
  UpdateIdentityByStaffCommand,
  UploadKbisByStaffCommand,
} from "../application/commands/admin-company-commands.js";
import { InvalidKbisFileError } from "../domain/errors/account-errors.js";

/** Backstop DoS du multipart, aligné sur le dépôt client (le domaine tranche à 10 Mo). */
const KBIS_UPLOAD_HARD_LIMIT = 20 * 1024 * 1024;

/** Le peu qu'on lit du fichier Multer — nom + octets, le domaine valide le reste. */
interface UploadedFilePart {
  readonly originalname: string;
  readonly buffer: Buffer;
}

/**
 * Surface **staff** des **pièces d'activation** d'une société (Porte B) : le
 * commercial complète une société **à la place** du client — dépôt du KBIS,
 * identité/TVA, condition de règlement **convenue**, adresses.
 *
 * Même montage à deux surfaces que {@link AdminCompaniesController} (`@Public()`
 * désarme le guard client, `AdminAuthGuard` réarme la porte staff) et même
 * préfixe `admin/companies`. Aucun mur membership dans les handlers — le staff
 * n'est membre d'aucune société ; l'auth staff est le seul mur. Le contrôleur ne
 * fait que le transport et dispatche au bus.
 */
@Controller("admin/companies")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminCompanyPiecesController {
  constructor(private readonly commands: CommandBus) {}

  /** Dépose (ou remplace) le KBIS. Multipart `file` ; le domaine valide le PDF. */
  @Put(":companyId/kbis")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: KBIS_UPLOAD_HARD_LIMIT } }))
  async uploadKbis(
    @Param("companyId") companyId: string,
    @UploadedFile() file: UploadedFilePart | undefined,
  ): Promise<void> {
    if (file === undefined) {
      throw new InvalidKbisFileError("aucun fichier reçu.");
    }
    await this.commands.execute<UploadKbisByStaffCommand, void>(
      new UploadKbisByStaffCommand(companyId, file.originalname, file.buffer),
    );
  }

  /**
   * **Certifie** le KBIS déposé : un agent a ouvert l'extrait et l'a comparé à
   * l'identité enregistrée. C'est ce geste, pas le dépôt, qui débloque
   * l'activation — et il est tracé (qui, à quel titre, quand).
   */
  @Post(":companyId/kbis/certification")
  @HttpCode(HttpStatus.NO_CONTENT)
  async certifyKbis(
    @Param("companyId") companyId: string,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<CertifyKbisCommand, void>(
      new CertifyKbisCommand(companyId, staffSub),
    );
  }

  /** Retire la certification — un clic de trop doit pouvoir se défaire. */
  @Delete(":companyId/kbis/certification")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeKbisCertification(@Param("companyId") companyId: string): Promise<void> {
    await this.commands.execute<RevokeKbisCertificationCommand, void>(
      new RevokeKbisCertificationCommand(companyId),
    );
  }

  /** Édite l'identité souple (enseigne + n° de TVA). */
  @Patch(":companyId/identity")
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateIdentity(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(updateIdentityPayloadSchema)) payload: UpdateIdentityPayload,
  ): Promise<void> {
    await this.commands.execute<UpdateIdentityByStaffCommand, void>(
      new UpdateIdentityByStaffCommand(companyId, payload),
    );
  }

  /**
   * **Accorde** les crédits de règlement (staff-only) : payer à la commande
   * reste toujours possible, ceci s'y ajoute.
   *
   * Le client, lui, ne peut que *demander* — accorder un délai est un acte
   * commercial. On reçoit l'ensemble complet plutôt qu'un ajout : l'écran
   * montre des interrupteurs, et deux clics rapides ne doivent pas laisser la
   * fiche et la base en désaccord.
   */
  @Patch(":companyId/granted-terms")
  @HttpCode(HttpStatus.NO_CONTENT)
  async grantTerms(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(grantTermsPayloadSchema)) payload: GrantTermsPayload,
  ): Promise<void> {
    await this.commands.execute<GrantTermsCommand, void>(
      new GrantTermsCommand(companyId, payload.grantedTerms),
    );
  }

  /**
   * Pose la **préférence d'acheminement** : comment ce client est servi
   * d'habitude.
   *
   * Elle ne conditionne rien — la commande s'ouvre dessus, et le client peut en
   * changer au panier. C'est ce qui la distingue des autres pièces : celles-là
   * bloquent l'activation, celle-ci fait gagner des clics.
   */
  @Patch(":companyId/fulfillment-preference")
  @HttpCode(HttpStatus.NO_CONTENT)
  async preferFulfillment(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(fulfillmentPreferencePayloadSchema)) payload: FulfillmentPreferencePayload,
  ): Promise<void> {
    await this.commands.execute<PreferFulfillmentByStaffCommand, void>(
      new PreferFulfillmentByStaffCommand(companyId, payload),
    );
  }

  /** Enregistre l'unique adresse de facturation (créée ou mise à jour). */
  @Patch(":companyId/billing-address")
  @HttpCode(HttpStatus.NO_CONTENT)
  async saveBilling(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(billingAddressPayloadSchema)) payload: BillingAddressPayload,
  ): Promise<void> {
    await this.commands.execute<SaveBillingAddressByStaffCommand, void>(
      new SaveBillingAddressByStaffCommand(companyId, payload),
    );
  }

  /**
   * **Active** le compte (`pending → active`). Gaté serveur : la société doit être
   * en attente et ses pièces `required` présentes, sinon `409`
   * (`CompanyActivationBlockedError`).
   */
  /**
   * Suspend, réactive ou résilie un compte — les gestes de fin de vie de la
   * relation, tenus depuis la fiche commerciale. Une seule route à trois
   * actions plutôt que trois verbes : c'est la MÊME décision (« où en est ce
   * compte »), et un motif l'accompagne.
   */
  @Patch(":companyId/status")
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeStatus(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(companyStatusPayloadSchema)) payload: CompanyStatusPayload,
  ): Promise<void> {
    await this.commands.execute<ChangeCompanyStatusCommand, void>(
      new ChangeCompanyStatusCommand(companyId, payload.action, payload.reason),
    );
  }

  @Post(":companyId/activate")
  @HttpCode(HttpStatus.NO_CONTENT)
  async activate(@Param("companyId") companyId: string): Promise<void> {
    await this.commands.execute<ActivateCompanyByStaffCommand, void>(
      new ActivateCompanyByStaffCommand(companyId),
    );
  }

  /** Ajoute une adresse de livraison ; renvoie son `id`. */
  @Post(":companyId/delivery-addresses")
  @HttpCode(HttpStatus.CREATED)
  async addDelivery(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(deliveryAddressPayloadSchema)) payload: DeliveryAddressPayload,
  ): Promise<CreatedAddressResponse> {
    const id = await this.commands.execute<AddDeliveryAddressByStaffCommand, string>(
      new AddDeliveryAddressByStaffCommand(companyId, payload),
    );
    return { id };
  }

  /**
   * Corrige une adresse de livraison **déjà posée**.
   *
   * Sans elle, le commercial ne pouvait qu'en *ajouter* une : un code d'accès
   * changé se réglait en créant un doublon, ou en demandant au client de le
   * faire — c'est-à-dire en attendant.
   */
  @Patch(":companyId/delivery-addresses/:addressId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateDelivery(
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
    @Body(new ZodBody(deliveryAddressPayloadSchema)) payload: DeliveryAddressPayload,
  ): Promise<void> {
    await this.commands.execute<UpdateDeliveryAddressByStaffCommand, void>(
      new UpdateDeliveryAddressByStaffCommand(companyId, addressId, payload),
    );
  }

  /** Désigne l'adresse de livraison par défaut. */
  @Patch(":companyId/delivery-addresses/:addressId/default")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setDefaultDelivery(
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
  ): Promise<void> {
    await this.commands.execute<SetDefaultDeliveryByStaffCommand, void>(
      new SetDefaultDeliveryByStaffCommand(companyId, addressId),
    );
  }

  /** Archive une adresse de livraison — jamais de suppression physique. */
  @Delete(":companyId/delivery-addresses/:addressId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeDelivery(
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
  ): Promise<void> {
    await this.commands.execute<RemoveDeliveryAddressByStaffCommand, void>(
      new RemoveDeliveryAddressByStaffCommand(companyId, addressId),
    );
  }
}
