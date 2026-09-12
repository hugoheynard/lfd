import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  type CreatedIdResponse,
  type MandateSectionView,
  type PaymentMandateView,
} from "@lfd/contracts";
import {
  Controller,
  Delete,
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
import { FileInterceptor } from "@nestjs/platform-express";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  contentDispositionAttachment,
  contentDispositionInline,
  sanitiseFileName,
} from "@lfd/storage";
import type { Response } from "express";

import { InvalidScannedDocumentError } from "../../../platform/shared/errors/storage-errors.js";
import {
  AttachMandateProofCommand,
  RevokeMandateCommand,
} from "../application/mandate-commands.js";
import { MintMandateCommand } from "../application/commands/mint-mandate.command.js";
import { type MandateProofFile } from "../application/queries/get-mandate-proof.handler.js";
import { GetMandateProofQuery } from "../application/queries/get-mandate-proof.query.js";
import { MandateProofNotFoundError } from "../domain/errors/mandate-errors.js";
import { GetCompanyMandateQuery } from "../application/mandate-queries.js";
import { PaymentGateway } from "../domain/payment-gateway.js";

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

  /** Dépose (ou remplace) le **mandat signé scanné**. Multipart `file`. */
  /**
   * **Frappe** le mandat : une RUM neuve, un papier à imprimer, rien de signé.
   *
   * `POST` et non `PUT` : le geste n'est pas idempotent au sens HTTP — il crée
   * une ressource et rend son identité. Le rejouer ne refrappe pas, il refuse
   * en 409 et nomme le brouillon existant, ce qui est le comportement utile
   * derrière un double clic.
   *
   * Rend l'identifiant du mandat et rien d'autre : c'est une écriture, et
   * l'écran relit. Un handler d'écriture qui rendrait la vue ferait croire que
   * la lecture est gratuite, et deux définitions de « ce qu'est un mandat »
   * finiraient par diverger.
   */
  @Post(":companyId/mandate")
  async mint(@Param("companyId") companyId: string): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<MintMandateCommand, string>(
      new MintMandateCommand(companyId),
    );
    return { id };
  }

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

  /**
   * Rend la **pièce déposée** : le mandat papier signé, descellé.
   *
   * 🔴 Cette route n'existait pas jusqu'au 2026-09-12. Le dépôt, lui, existait
   * depuis toujours : la seule pièce qui prouve le consentement était donc
   * **entrée sans jamais pouvoir ressortir**, sauf à ouvrir le bucket à la main.
   * Une preuve qu'on ne sait pas produire ne prouve rien au moment où l'on en a
   * besoin, et c'est le seul moment qui compte.
   *
   * `inline` bascule la disposition, comme pour la fiche exemple : c'est la
   * différence entre REGARDER la pièce dans un onglet et l'accumuler dans un
   * dossier de téléchargements.
   *
   * Le nom du fichier est **assaini** avant de partir dans l'en-tête : il vient
   * d'un dépôt, donc d'une saisie, et un nom porteur de guillemets ou de retours
   * à la ligne découperait l'en-tête HTTP.
   */
  @Get(":companyId/mandate/proof")
  async proof(
    @Param("companyId") companyId: string,
    @Query("inline") inline: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const proof = await this.queries.execute<GetMandateProofQuery, MandateProofFile | null>(
      new GetMandateProofQuery(companyId),
    );
    if (proof === null) {
      throw new MandateProofNotFoundError(companyId);
    }
    const fileName = sanitiseFileName(proof.fileName);
    response.setHeader("Content-Type", proof.contentType);
    response.setHeader(
      "Content-Disposition",
      inline === "1" ? contentDispositionInline(fileName) : contentDispositionAttachment(fileName),
    );
    return new StreamableFile(proof.bytes);
  }

  /** Retire l'autorisation de prélever — chez le prestataire, puis chez nous. */
  @Delete(":companyId/mandate")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param("companyId") companyId: string): Promise<void> {
    await this.commands.execute<RevokeMandateCommand, void>(new RevokeMandateCommand(companyId));
  }
}
