import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  type MandateSectionView,
  type PaymentMandateView,
  type RegisterMandatePayload,
  registerMandatePayloadSchema,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { InvalidScannedDocumentError } from "../../../platform/shared/errors/storage-errors.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  AttachMandateProofCommand,
  RegisterMandateCommand,
  RevokeMandateCommand,
} from "../application/mandate-commands.js";
import { GetCompanyMandateQuery } from "../application/mandate-queries.js";
import { PaymentGateway } from "../domain/payment-gateway.js";
import type { CreatedIdResponse } from "@lfd/contracts";

/** Backstop DoS du multipart, aligné sur le KBIS (le domaine tranche à 10 Mo). */
const PROOF_UPLOAD_HARD_LIMIT = 20 * 1024 * 1024;

/** Le peu qu'on lit du fichier Multer — nom + octets, le domaine valide le reste. */
interface UploadedFilePart {
  readonly originalname: string;
  readonly buffer: Buffer;
}

/**
 * Surface **staff** du mandat de prélèvement d'une société.
 *
 * Staff-only, et ce n'est pas une commodité : la clientèle visée ne saisira
 * jamais ses coordonnées bancaires elle-même — le registre repris arrive avec,
 * et c'est le commercial qui les reporte. Il n'y a donc pas d'endpoint client
 * jumeau, contrairement au KBIS.
 *
 * Surface staff murée par `@AdminSurface` : identité vérifiée, puis périmètre.
 */
@Controller("admin/companies")
@AdminSurface("b2b_payments")
export class AdminMandatesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
    private readonly payments: PaymentGateway,
  ) {}

  /**
   * De quoi peindre la section : le mandat **courant** — l'actif, sinon le
   * dernier connu ; `null` si la société n'en a jamais eu, ce qui est le cas
   * ordinaire — et la clé publique pour monter l'IBAN Element.
   *
   * Les deux ensemble plutôt qu'en deux appels : l'écran n'est utilisable
   * qu'avec les deux, et un second aller-retour ne lui apprendrait rien.
   */
  @Get(":companyId/mandate")
  async mandate(@Param("companyId") companyId: string): Promise<MandateSectionView> {
    const mandate = await this.queries.execute<GetCompanyMandateQuery, PaymentMandateView | null>(
      new GetCompanyMandateQuery(companyId),
    );
    return { mandate, publishableKey: this.payments.publishableKey() };
  }

  /**
   * Enregistre un mandat depuis un moyen de paiement créé par l'IBAN Element.
   *
   * **L'IBAN n'entre pas ici** : il est parti du navigateur directement chez
   * Stripe, et ce corps ne porte qu'un identifiant. C'est ce qui fait qu'aucun
   * journal de ce backend ne peut contenir de coordonnées bancaires.
   */
  @Post(":companyId/mandate")
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(registerMandatePayloadSchema)) payload: RegisterMandatePayload,
  ): Promise<CreatedIdResponse> {
    const acceptedAt = payload.acceptedAt === undefined ? null : new Date(payload.acceptedAt);
    const id = await this.commands.execute<RegisterMandateCommand, string>(
      new RegisterMandateCommand(companyId, payload.paymentMethodId, acceptedAt),
    );
    return { id };
  }

  /** Dépose (ou remplace) le **mandat signé scanné**. Multipart `file`. */
  @Put(":companyId/mandate/proof")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: PROOF_UPLOAD_HARD_LIMIT } }))
  async uploadProof(
    @Param("companyId") companyId: string,
    @UploadedFile() file: UploadedFilePart | undefined,
  ): Promise<void> {
    if (file === undefined) {
      throw new InvalidScannedDocumentError("aucun fichier reçu.");
    }
    await this.commands.execute<AttachMandateProofCommand, void>(
      new AttachMandateProofCommand(companyId, file.originalname, file.buffer),
    );
  }

  /** Retire l'autorisation de prélever — chez le prestataire, puis chez nous. */
  @Delete(":companyId/mandate")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param("companyId") companyId: string): Promise<void> {
    await this.commands.execute<RevokeMandateCommand, void>(new RevokeMandateCommand(companyId));
  }
}
