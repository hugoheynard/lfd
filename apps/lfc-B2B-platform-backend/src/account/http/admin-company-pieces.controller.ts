import {
  type BillingAddressPayload,
  billingAddressPayloadSchema,
  type CreatedAddressResponse,
  type DeliveryAddressPayload,
  deliveryAddressPayloadSchema,
  type UpdateIdentityPayload,
  updateIdentityPayloadSchema,
  type UpdatePaymentTermPayload,
  updatePaymentTermPayloadSchema,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
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
import { Public } from "../../infra/auth/public.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { ActivateCompanyByStaffCommand } from "../application/commands/activate-company.command.js";
import {
  AddDeliveryAddressByStaffCommand,
  SaveBillingAddressByStaffCommand,
  SetAgreedPaymentTermCommand,
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
   * Fixe la condition de règlement **convenue** (staff-only). Contrairement au
   * client — qui ne peut que *demander* (`requested_payment_term`) — le staff
   * écrit le terme réel et solde la demande.
   */
  @Patch(":companyId/payment-term")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setPaymentTerm(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(updatePaymentTermPayloadSchema)) payload: UpdatePaymentTermPayload,
  ): Promise<void> {
    await this.commands.execute<SetAgreedPaymentTermCommand, void>(
      new SetAgreedPaymentTermCommand(companyId, payload.paymentTerm),
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
}
