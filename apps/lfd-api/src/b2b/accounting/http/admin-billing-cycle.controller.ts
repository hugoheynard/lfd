import { sepaSchemeSchema, type BillingCycleView, type SepaScheme } from "@lfd/contracts";
import { Controller, Get, Header, Query, Res } from "@nestjs/common";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import type { Response } from "express";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import type { CycleAuditFile } from "../application/queries/export-cycle-audit.handler.js";
import type { CycleDraftFile } from "../application/queries/export-cycle-draft.handler.js";
import {
  ExportCycleAuditQuery,
  ExportCycleDraftQuery,
  GetCurrentBillingCycleQuery,
} from "../application/queries/billing-cycle-queries.js";

/** `?scheme=CORE|B2B` — facultatif, pour ne pas casser l'écran déjà en ligne. */
const schemeQuerySchema = sepaSchemeSchema.optional();

/**
 * Le schéma rendu quand `?scheme` est absent : `B2B`, le seul fichier que la
 * route rendait avant le 2026-09-15.
 *
 * @deprecated L'absence du paramètre ne survit que pour le front admin déjà
 * déployé, qui n'appelle qu'un seul `draft.xml`. Tout nouvel appelant passe
 * `?scheme=` ; ce repli disparaît quand l'écran à deux téléchargements est en
 * ligne (plan `documentation/comptabilite/plan-mandat-deux-schemas.md`, objection 9).
 */
const LEGACY_DEFAULT_SCHEME: SepaScheme = "B2B";

/**
 * Surface **staff** du cycle de prélèvement.
 *
 * Un contrôleur à part de celui des entités, et pas par symétrie : un cycle
 * n'est pas une entité juridique, il n'en dépend pas, et il portera bientôt des
 * gestes qui n'ont rien à voir — clôturer, rouvrir. Les loger dans le contrôleur
 * de l'entité aurait fait de celui-ci l'endroit où l'on met la comptabilité.
 */
@Controller("admin/accounting/billing-cycle")
@AdminSurface("b2b_accounting")
export class AdminBillingCycleController {
  constructor(private readonly queries: QueryBus) {}

  /** Le cycle en cours. Ne clôture rien : deux appels rendent la même fenêtre. */
  @Get("current")
  async current(): Promise<BillingCycleView> {
    return this.queries.execute<GetCurrentBillingCycleQuery, BillingCycleView>(
      new GetCurrentBillingCycleQuery(),
    );
  }

  /**
   * Le **brouillon** de fichier de prélèvement du cycle en cours, pour UN
   * schéma (`?scheme=CORE|B2B`, `B2B` si absent — déprécié).
   *
   * `GET` : rien n'est clôturé, aucun lot n'est créé, aucune commande n'est
   * marquée. Deux appels rendent le même fichier.
   *
   * 🔴 Le nom du fichier ET son en-tête portent l'avertissement tant que le
   * cycle ENTIER n'est pas mandaté : une société sans mandat actif rend les
   * deux fichiers indéposables, et leur bandeau la nomme. Un lot incomplet qui
   * ressemble à un lot valide est exactement ce qui finit déposé un vendredi
   * soir.
   *
   * Le nom — `[BROUILLON-]prelevement-<schéma>-<siren>-<cycle>.xml` — est fait
   * pour être LU par l'écran dans `Content-Disposition`.
   *
   * Répond **409** si l'entité ne peut pas encaisser : c'est `creditorSnapshot()`
   * qui refuse, en nommant ce qui manque.
   */
  @Get("draft.xml")
  @Header("Content-Type", "application/xml; charset=utf-8")
  async draft(
    @Query("legalEntityId") legalEntityId: string,
    @Query("scheme", new ZodQuery(schemeQuerySchema)) scheme: SepaScheme | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.queries.execute<ExportCycleDraftQuery, CycleDraftFile>(
      new ExportCycleDraftQuery(legalEntityId, scheme ?? LEGACY_DEFAULT_SCHEME),
    );
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(file.fileName, "BROUILLON-prelevement.xml")),
    );
    return file.xml;
  }

  /**
   * Le **contrôle** du brouillon d'un schéma, en CSV — lu depuis le XML, jamais
   * à côté. Même `?scheme` que `draft.xml`, même repli déprécié.
   *
   * 🔴 C'est ce qui lui donne sa valeur : il atteste ce que le fichier CONTIENT.
   * Un CSV recalculé depuis l'assiette pourrait porter le même défaut que le XML
   * et les deux s'accorderaient — le contrôle attesterait alors l'erreur au lieu
   * de la trouver.
   *
   * Il confronte les deux totaux que le fichier DÉCLARE — `NbOfTxs` et
   * `CtrlSum` — à ce qu'on obtient en comptant et sommant ses lignes. Ce sont
   * les deux champs dont un centime d'écart fait rejeter le message entier.
   */
  @Get("draft-audit.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async draftAudit(
    @Query("legalEntityId") legalEntityId: string,
    @Query("scheme", new ZodQuery(schemeQuerySchema)) scheme: SepaScheme | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.queries.execute<ExportCycleAuditQuery, CycleAuditFile>(
      new ExportCycleAuditQuery(legalEntityId, scheme ?? LEGACY_DEFAULT_SCHEME),
    );
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(file.fileName, "CONTROLE-prelevement.csv")),
    );
    return file.csv;
  }
}
