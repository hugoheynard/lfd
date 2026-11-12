import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  type BillingAddressPayload,
  type CertifyKbisPayload,
  certifyKbisPayloadSchema,
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
  Get,
  HttpCode,
  HttpStatus,
  Delete,
  Param,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import type { Response } from "express";

import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ChangeCompanyStatusCommand } from "../application/commands/change-company-status.command.js";
import { ActivateCompanyByStaffCommand } from "../application/commands/activate-company.command.js";
import { CertifyKbisCommand } from "../application/commands/certify-kbis.command.js";
import { RevokeKbisCertificationCommand } from "../application/commands/revoke-kbis-certification.command.js";
import { DownloadKbisForStaffQuery } from "../application/queries/download-kbis-for-staff.query.js";
import { type KbisDownload } from "../application/queries/download-kbis.query.js";
import { AddDeliveryAddressByStaffCommand } from "../application/commands/add-delivery-address-by-staff.command.js";
import { SaveBillingAddressByStaffCommand } from "../application/commands/save-billing-address-by-staff.command.js";
import { GrantTermsCommand } from "../application/commands/grant-terms.command.js";
import { PreferFulfillmentByStaffCommand } from "../application/commands/prefer-fulfillment-by-staff.command.js";
import { RemoveDeliveryAddressByStaffCommand } from "../application/commands/remove-delivery-address-by-staff.command.js";
import { SetDefaultDeliveryByStaffCommand } from "../application/commands/set-default-delivery-by-staff.command.js";
import { UpdateDeliveryAddressByStaffCommand } from "../application/commands/update-delivery-address-by-staff.command.js";
import { UpdateIdentityByStaffCommand } from "../application/commands/update-identity-by-staff.command.js";
import { UploadKbisByStaffCommand } from "../application/commands/upload-kbis-by-staff.command.js";
import { InvalidKbisFileError } from "../domain/errors/account-errors.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

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
 * Surface staff murée par `@AdminSurface`, et même préfixe `admin/companies` que
 * {@link AdminCompaniesController}. Aucun mur membership dans les handlers — le staff
 * n'est membre d'aucune société ; l'auth staff est le seul mur. Le contrôleur ne
 * fait que le transport et dispatche au bus.
 */
@Controller("admin/companies")
@AdminSurface("b2b_companies")
export class AdminCompanyPiecesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Sert l'extrait au staff, pour qu'il puisse **le lire avant de le certifier**.
   *
   * Sans cette route, « J'ai vérifié cet extrait » était un clic à l'aveugle :
   * la fiche staff masquait Voir/Télécharger faute d'endpoint, et la garantie
   * sur laquelle repose l'activation ne reposait sur rien.
   *
   * `Content-Disposition: attachment` avec un nom **assaini** — jamais le nom
   * brut du client dans un en-tête ; le front en fait un blob de toute façon.
   */
  @Get(":companyId/kbis")
  async downloadKbis(
    @Param("companyId") companyId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const kbis = await this.queries.execute<DownloadKbisForStaffQuery, KbisDownload>(
      new DownloadKbisForStaffQuery(companyId),
    );
    res.setHeader("Content-Type", kbis.contentType);
    res.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(kbis.fileName, "kbis.pdf")),
    );
    return new StreamableFile(kbis.bytes);
  }

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
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(certifyKbisPayloadSchema)) payload: CertifyKbisPayload,
  ): Promise<void> {
    await this.commands.execute<CertifyKbisCommand, void>(
      new CertifyKbisCommand(companyId, staffUserId, payload.issuedOn),
    );
  }

  /** Retire la certification — un clic de trop doit pouvoir se défaire. */
  @Delete(":companyId/kbis/certification")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "retire la certification : rejouée, il n'y a plus rien de certifié et rien n'est écrit ni journalisé",
  )
  async revokeKbisCertification(@Param("companyId") companyId: string): Promise<void> {
    await this.commands.execute<RevokeKbisCertificationCommand, void>(
      new RevokeKbisCertificationCommand(companyId),
    );
  }

  /** Édite l'identité souple (enseigne + n° de TVA). */
  @Patch(":companyId/identity")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "pose l'identité : rejouée, l'agrégat la relit identique et rien n'est écrit ni journalisé",
  )
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
  @Idempotent(
    "pose l'ensemble des crédits accordés : rejouée, l'agrégat les trouve identiques et rien n'est écrit ni journalisé",
  )
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
  @Idempotent(
    "pose la préférence d'acheminement : rejouée, l'agrégat la trouve identique et rien n'est écrit ni journalisé",
  )
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
  @Idempotent(
    "pose l'adresse de facturation : rejouée, la même adresse n'est ni réécrite ni journalisée",
  )
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
  @Idempotent(
    "suspendre, réactiver, résilier : rejouée, le compte n'est plus dans l'état de départ et la transition est refusée sans rien écrire",
  )
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
  @Idempotent(
    "active un compte en attente : rejouée, le compte n'est plus en attente et l'activation est refusée sans rien écrire",
  )
  async activate(
    @Param("companyId") companyId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ActivateCompanyByStaffCommand, void>(
      new ActivateCompanyByStaffCommand(companyId, staffUserId),
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
  @Idempotent(
    "pose une adresse du carnet : rejouée, le carnet la trouve identique et rien n'est écrit ni journalisé",
  )
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
  @Idempotent(
    "désigne l'adresse par défaut : rejouée, elle l'est déjà et rien n'est écrit ni journalisé",
  )
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
  @Idempotent(
    "archive l'adresse : rejoué, elle n'est plus vivante au carnet et le geste est refusé (404) sans rien écrire",
  )
  async removeDelivery(
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
  ): Promise<void> {
    await this.commands.execute<RemoveDeliveryAddressByStaffCommand, void>(
      new RemoveDeliveryAddressByStaffCommand(companyId, addressId),
    );
  }
}
