import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  signMandatePayloadSchema,
  type SignMandatePayload,
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
  Body,
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
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AttachMandateProofCommand } from "../application/commands/attach-mandate-proof.command.js";
import { RevokeMandateCommand } from "../application/commands/revoke-mandate.command.js";
import { MintMandateCommand } from "../application/commands/mint-mandate.command.js";
import { SendMandateCommand } from "../application/commands/send-mandate.command.js";
import { SignMandateCommand } from "../application/commands/sign-mandate.command.js";
import { type MandateProofFile } from "../application/queries/get-mandate-proof.handler.js";
import { GetMandateProofQuery } from "../application/queries/get-mandate-proof.query.js";
import type { MandateMintReadinessView } from "../application/queries/get-mandate-mint-blockers.handler.js";
import { GetMandateMintBlockersQuery } from "../application/queries/get-mandate-mint-blockers.query.js";
import {
  MandateNotFoundError,
  MandateProofNotFoundError,
} from "../domain/errors/mandate-errors.js";
import { GetCompanyMandateQuery } from "../application/queries/get-company-mandate.query.js";
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
 * ⚠️ Ce JSDoc affirmait qu'il n'existerait jamais d'endpoint client jumeau, « la
 * clientèle ne saisira jamais ses coordonnées bancaires ». C'est faux depuis le
 * 2026-09-14 : le client dépose son RIB (`CompanyBankAccountController`), génère,
 * télécharge et renvoie son mandat (`CompanyMandateController`). Ce qui reste
 * propre au staff, et le restera : **activer** (déclarer la date du papier après
 * l'avoir relu), **envoyer** par courriel, **révoquer**, et relire la pièce.
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
   *
   * Depuis le 2026-09-15, la section porte aussi `mintBlockers` — ce qui
   * empêcherait de frapper, jugé par la lecture de la frappe elle-même. Une
   * société inconnue y répond donc 404, là où le mandat seul rendait `null`.
   */
  @Get(":companyId/mandate")
  async mandate(@Param("companyId") companyId: string): Promise<MandateSectionView> {
    const mandate = await this.queries.execute<GetCompanyMandateQuery, PaymentMandateView | null>(
      new GetCompanyMandateQuery(companyId),
    );
    const readiness = await this.queries.execute<
      GetMandateMintBlockersQuery,
      MandateMintReadinessView
    >(new GetMandateMintBlockersQuery(companyId));
    return {
      mandate,
      publishableKey: this.payments.publishableKey(),
      mintBlockers: readiness.blockers,
      issuerScheme: readiness.issuerScheme,
    };
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

  /**
   * Déclare qu'un brouillon est **revenu signé**, et l'active.
   *
   * Le mandat est visé **par son identifiant** dans le chemin : c'est le geste
   * où l'ambiguïté coûte le plus cher, un mandat actif pouvant être en vigueur
   * pendant qu'on fait signer son remplaçant.
   *
   * `ZodBody` et non un `.parse` nu depuis le 2026-09-15 : une charge mal formée
   * — un écran encore en ligne qui n'envoie pas `proofRevision` — rendait une
   * `ZodError` non catégorisée, donc un 500 « erreur inattendue ».
   *
   * La validation Zod ne porte que la FORME de la date. Qu'elle soit dans le
   * futur, ou que le mandat ne soit pas un brouillon, est refusé par l'agrégat —
   * la règle métier n'a pas à exister à deux endroits.
   */
  @Put(":companyId/mandate/:mandateId/signature")
  @HttpCode(HttpStatus.NO_CONTENT)
  async sign(
    @Param("companyId") companyId: string,
    @Param("mandateId") mandateId: string,
    @Body(new ZodBody(signMandatePayloadSchema)) payload: SignMandatePayload,
  ): Promise<void> {
    const { signedAt, proofRevision } = payload;
    await this.commands.execute<SignMandateCommand, void>(
      new SignMandateCommand(companyId, mandateId, signedAt, proofRevision),
    );
  }

  /**
   * Envoie au client **son mandat à signer**, en pièce jointe.
   *
   * ⚠️ **Un courriel parti est parti.** Le geste n'a pas de retour arrière, et
   * l'idempotence du mailer empêche le doublon, pas le regret. C'est l'écran
   * qui doit demander confirmation, pas cette route — un refus ici arriverait
   * après l'envoi.
   *
   * Le serveur refuse un mandat non frappé (il porterait le filigrane EXEMPLE)
   * et un mandat déjà signé (un second exemplaire de la même référence
   * circulerait).
   */
  @Post(":companyId/mandate/:mandateId/send")
  @HttpCode(HttpStatus.NO_CONTENT)
  async send(
    @Param("companyId") companyId: string,
    @Param("mandateId") mandateId: string,
  ): Promise<void> {
    await this.commands.execute<SendMandateCommand, void>(
      new SendMandateCommand(companyId, mandateId),
    );
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
  @Get(":companyId/mandate/:mandateId/proof")
  async proof(
    @Param("companyId") companyId: string,
    @Param("mandateId") mandateId: string,
    @Query("inline") inline: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const proof = await this.queries.execute<GetMandateProofQuery, MandateProofFile | null>(
      new GetMandateProofQuery(companyId, mandateId),
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

  /**
   * ⚠️ **Dépréciée le 2026-09-14** — la pièce du mandat COURANT. Remplacée par
   * `GET :companyId/mandate/:mandateId/proof`, qui dit de quel mandat on parle.
   *
   * Gardée parce qu'un back-office déjà chargé l'appelle encore : un contrat
   * servi ne se casse pas dans le déploiement qui le remplace (`CLAUDE.md` §0).
   * À retirer une fois le front déployé.
   */
  @Get(":companyId/mandate/proof")
  async currentProof(
    @Param("companyId") companyId: string,
    @Query("inline") inline: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const current = await this.queries.execute<GetCompanyMandateQuery, PaymentMandateView | null>(
      new GetCompanyMandateQuery(companyId),
    );
    if (current === null) {
      throw new MandateNotFoundError(companyId);
    }
    return this.proof(companyId, current.id, inline, response);
  }

  /** Retire l'autorisation de prélever — chez le prestataire, puis chez nous. */
  @Delete(":companyId/mandate")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param("companyId") companyId: string): Promise<void> {
    await this.commands.execute<RevokeMandateCommand, void>(new RevokeMandateCommand(companyId));
  }
}
