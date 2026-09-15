import {
  type CompanyBankAccountSectionView,
  type CompanyBankAccountView,
  type SetCompanyBankAccountPayload,
  setCompanyBankAccountPayloadSchema,
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
  Put,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  contentDispositionAttachment,
  contentDispositionInline,
  sanitiseFileName,
} from "@lfd/storage";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SetCompanyBankAccountCommand } from "../application/commands/set-company-bank-account.command.js";
import { SetMandateOptionsCommand } from "../application/commands/set-mandate-options.command.js";
import { GetCompanyBankAccountQuery } from "../application/queries/get-company-bank-account.query.js";
import type { CustomerMandatePdf } from "../application/queries/preview-customer-mandate.handler.js";
import { PreviewCustomerMandateQuery } from "../application/queries/preview-customer-mandate.query.js";

/**
 * Surface **staff** du RIB d'une société cliente.
 *
 * Contrôleur à part du mandat, alors que les deux peignent la même section
 * d'écran : ce sont deux sujets, pas deux gestes d'un même sujet. Le RIB est une
 * coordonnée qu'on recopie ; le mandat est une autorisation qu'on obtient. Les
 * réunir ici ferait le fichier où l'on pose la troisième chose.
 *
 * Surface du **back-office** — ce n'est plus la seule. Cette phrase disait
 * jusqu'au 2026-09-14 que la clientèle ne saisit pas ses coordonnées bancaires ;
 * c'est faux depuis le RIB client (`documentation/comptabilite/plan-rib-client.md`) : le
 * détenteur et le rôle facturation déposent le leur, et règlent les zones 14/19,
 * par `company-bank-account.controller.ts` (vérifié le 2026-09-14). Ce
 * contrôleur-ci reste celui du commercial qui reporte un RIB papier ; il n'a pas
 * le refus sous mandat actif que porte le chemin client.
 */
@Controller("admin/companies")
@AdminSurface("b2b_payments")
export class AdminCompanyBankAccountController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Le RIB du client, ou `null` s'il n'en a jamais déposé — le cas ordinaire.
   *
   * 🔴 L'IBAN ne redescend **jamais** : la vue n'en porte que les quatre
   * derniers caractères. Une réponse qui porterait un IBAN entier est une
   * réponse qui finit dans un journal d'accès.
   */
  @Get(":companyId/bank-account")
  async read(@Param("companyId") companyId: string): Promise<CompanyBankAccountSectionView> {
    // Enveloppé, jamais rendu nu : Nest sérialise un `null` de contrôleur en
    // CORPS VIDE, et le front recevrait `""` plutôt que `null`.
    const account = await this.queries.execute<
      GetCompanyBankAccountQuery,
      CompanyBankAccountView | null
    >(new GetCompanyBankAccountQuery(companyId));
    return { account };
  }

  /**
   * Recopie le RIB — titulaire, adresse, IBAN, BIC, **en un seul geste**.
   *
   * L'IBAN monte ici en clair, et c'est la seule direction où il circule. Il est
   * **scellé** avant d'entrer en colonne (AES-256-GCM) : c'est le régime du
   * compte d'un client, et il diffère de celui du compte créancier, stocké en
   * clair. L'asymétrie est écrite dans `company-bank-account.ts`.
   *
   * Les quatre parties sont exigées ensemble : un compte à moitié rempli ne se
   * découvrirait qu'au rejet du lot, cinq jours après l'envoi.
   */
  @Put(":companyId/bank-account")
  @HttpCode(HttpStatus.NO_CONTENT)
  async set(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(setCompanyBankAccountPayloadSchema)) payload: SetCompanyBankAccountPayload,
  ): Promise<void> {
    await this.commands.execute<SetCompanyBankAccountCommand, void>(
      new SetCompanyBankAccountCommand(companyId, payload),
    );
  }

  /**
   * Réécrit les **zones facultatives** du mandat — 14, 19 et 20.
   *
   * Route à part du RIB, et pas par commodité : le `PUT` du RIB exige l'IBAN,
   * qui ne redescend jamais. Passer par lui pour corriger une description de
   * contrat obligerait à ressaisir un IBAN à chaque fois — et ressaisir un IBAN
   * pour changer une ligne de texte est exactement le geste qui finit par une
   * faute de frappe sur un compte bancaire.
   *
   * Refuse **404** si le client n'a pas de RIB : ces zones vivent sur la même
   * ligne, et il n'y en a pas encore.
   */
  @Put(":companyId/mandate-options")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setOptions(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(setMandateOptionsPayloadSchema)) payload: SetMandateOptionsPayload,
  ): Promise<void> {
    await this.commands.execute<SetMandateOptionsCommand, void>(
      new SetMandateOptionsCommand(companyId, payload),
    );
  }

  /**
   * **L'aperçu du mandat de ce client**, les deux côtés remplis.
   *
   * 🔴 Il porte la mention « EXEMPLE » **tant qu'aucun brouillon n'est frappé** :
   * sans RUM, une signature apposée dessus créerait un mandat sans référence —
   * inutilisable, mais que le client croirait avoir donné.
   *
   * ⚠️ Ce JSDoc disait « toujours EXEMPLE » : faux depuis la frappe de la RUM
   * (2026-09-12). `buildCustomerMandate` imprime la RUM du brouillon et le
   * filigrane tombe avec elle — c'est le même document que la pièce jointe du
   * courriel et que le PDF du client (constaté le 2026-09-14).
   *
   * `GET` : rien n'est créé, et deux appels rendent le même fichier. Frapper une
   * RUM, elle, est une commande (`POST :companyId/mandate`).
   *
   * Refus possibles, tous nommés : pas de RIB (404), aucune entité émettrice ou
   * plusieurs (409), entité sans ICS (409).
   */
  @Get(":companyId/mandate/preview.pdf")
  async previewMandate(
    @Param("companyId") companyId: string,
    @Res({ passthrough: true }) response: Response,
    @Query("inline") inline?: string,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<PreviewCustomerMandateQuery, CustomerMandatePdf>(
      new PreviewCustomerMandateQuery(companyId),
    );
    const fileName = sanitiseFileName(pdf.fileName, "apercu-mandat-sepa.pdf");
    response.setHeader("Content-Type", "application/pdf");
    // Même bascule que la fiche d'exemple, et pour la même raison : l'écran veut
    // REGARDER avant d'imprimer, et accumuler des PDF dans un dossier de
    // téléchargements pour vérifier une adresse est le contraire d'un contrôle.
    // `1` exactement, défaut à l'enregistrement.
    response.setHeader(
      "Content-Disposition",
      inline === "1" ? contentDispositionInline(fileName) : contentDispositionAttachment(fileName),
    );
    return new StreamableFile(pdf.bytes);
  }
}
