import {
  type CustomerMandateOptionsSectionView,
  type CustomerMandateView,
  type SetMandateOptionsPayload,
  setMandateOptionsPayloadSchema,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  contentDispositionAttachment,
  contentDispositionInline,
  sanitiseFileName,
} from "@lfd/storage";
import type { Response } from "express";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { InvalidScannedDocumentError } from "../../../platform/shared/errors/storage-errors.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AttachMyCompanyMandateProofCommand } from "../application/commands/attach-my-company-mandate-proof.command.js";
import { MintMyCompanyMandateCommand } from "../application/commands/mint-my-company-mandate.command.js";
import { SetMyCompanyMandateOptionsCommand } from "../application/commands/set-my-company-mandate-options.command.js";
import { GetMyCompanyMandateDocumentQuery } from "../application/queries/get-my-company-mandate-document.query.js";
import { GetMyCompanyMandateOptionsQuery } from "../application/queries/get-my-company-mandate-options.query.js";
import { GetMyCompanyMandateQuery } from "../application/queries/get-my-company-mandate.query.js";
import type { CustomerMandatePdf } from "../application/queries/preview-customer-mandate.handler.js";

/** Backstop DoS du multipart, aligné sur le staff et le KBIS (le domaine tranche à 10 Mo). */
const PROOF_UPLOAD_HARD_LIMIT = 20 * 1024 * 1024;

/** Le peu qu'on lit du fichier Multer — nom + octets, le domaine valide le reste. */
interface UploadedFilePart {
  readonly originalname: string;
  readonly buffer: Buffer;
}

/**
 * Surface **client** du mandat de prélèvement — la carte mandat de `/mon-compte`.
 *
 * Plan : `documentation/b2b/plan-mandat-client.md`, contrat en fin de §9. Le mur
 * (détenteur ou facturation), le drapeau `customerMandate` et les règles vivent
 * dans les handlers, dans cet ordre : 404 → 403 → 409 drapeau → règle métier.
 * Ce contrôleur ne fait que le transport.
 *
 * Le client génère, télécharge et renvoie signé. Il n'active pas : activer
 * autorise un débit, et reste le geste d'un commercial qui a relu la pièce.
 */
@Controller("companies")
export class CompanyMandateController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Le mandat courant, ou `null` s'il n'en a jamais eu.
   *
   * 🔴 `null` est écrit en JSON à la main. Rendu par Nest, un `null` de
   * contrôleur part en CORPS VIDE (`ExpressAdapter.reply`, vérifié le
   * 2026-09-14) — la raison pour laquelle le RIB s'enveloppe. Le contrat de ce
   * lot dit « la vue ou `null` » : on tient le contrat plutôt que de l'envelopper.
   */
  @Get(":companyId/mandate")
  async read(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Res() response: Response,
  ): Promise<void> {
    response.status(HttpStatus.OK).json(await this.view(user, companyId));
  }

  /**
   * Génère le mandat — ou rend le brouillon qui attend déjà sa signature — et
   * rend la vue relue. `200` et non `201` : un rechargement ne crée rien.
   *
   * La commande rend l'identifiant, la lecture rend la vue : le contrôleur les
   * enchaîne, aucun handler d'écriture ne rend de modèle de lecture.
   */
  @Post(":companyId/mandate")
  async mint(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Res() response: Response,
  ): Promise<void> {
    await this.commands.execute<MintMyCompanyMandateCommand, string>(
      new MintMyCompanyMandateCommand(user.userId, companyId),
    );
    response.status(HttpStatus.OK).json(await this.view(user, companyId));
  }

  /**
   * Le mandat à signer, nominatif — **brouillon seulement**. `?inline=1` pour
   * le regarder dans un onglet, sinon il se télécharge.
   *
   * ⚠️ L'IBAN entier y est imprimé, et c'est assumé (Hugo, 2026-09-14) : un
   * mandat EPC porte l'IBAN du débiteur. Le JSON, lui, ne le rend jamais.
   */
  @Get(":companyId/mandate/document.pdf")
  async document(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Query("inline") inline: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetMyCompanyMandateDocumentQuery, CustomerMandatePdf>(
      new GetMyCompanyMandateDocumentQuery(user.userId, companyId),
    );
    const fileName = sanitiseFileName(pdf.fileName, "mandat-sepa.pdf");
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      inline === "1" ? contentDispositionInline(fileName) : contentDispositionAttachment(fileName),
    );
    return new StreamableFile(pdf.bytes);
  }

  /** Renvoie le mandat signé — multipart `file`, PDF ou photo. Statut inchangé. */
  @Put(":companyId/mandate/proof")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: PROOF_UPLOAD_HARD_LIMIT } }))
  async uploadProof(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @UploadedFile() file: UploadedFilePart | undefined,
  ): Promise<void> {
    if (file === undefined) {
      throw new InvalidScannedDocumentError("aucun fichier reçu.");
    }
    await this.commands.execute<AttachMyCompanyMandateProofCommand, void>(
      new AttachMyCompanyMandateProofCommand(
        user.userId,
        companyId,
        file.originalname,
        file.buffer,
      ),
    );
  }

  /**
   * Les zones 14 et 19, ou `{ options: null }` tant qu'aucun RIB n'est déposé,
   * avec le schéma de l'émetteur. Enveloppé : un `null` de contrôleur partirait
   * en corps vide.
   */
  @Get(":companyId/mandate-options")
  async readOptions(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
  ): Promise<CustomerMandateOptionsSectionView> {
    return this.queries.execute<GetMyCompanyMandateOptionsQuery, CustomerMandateOptionsSectionView>(
      new GetMyCompanyMandateOptionsQuery(user.userId, companyId),
    );
  }

  /**
   * Réécrit les zones 14 et 19 — le même payload que le staff (plan §10). Sans
   * RIB 404 ; sous un mandat actif 409 ; un brouillon en cours devient caduc.
   */
  @Put(":companyId/mandate-options")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setOptions(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(setMandateOptionsPayloadSchema)) payload: SetMandateOptionsPayload,
  ): Promise<void> {
    await this.commands.execute<SetMyCompanyMandateOptionsCommand, void>(
      new SetMyCompanyMandateOptionsCommand(user.userId, companyId, payload),
    );
  }

  private view(user: Principal, companyId: string): Promise<CustomerMandateView | null> {
    return this.queries.execute<GetMyCompanyMandateQuery, CustomerMandateView | null>(
      new GetMyCompanyMandateQuery(user.userId, companyId),
    );
  }
}
