import type { BillingCycleView } from "@lfd/contracts";
import { Controller, Get, Header, Query, Res } from "@nestjs/common";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import type { Response } from "express";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import type { CycleDraftFile } from "../application/queries/export-cycle-draft.handler.js";
import {
  ExportCycleDraftQuery,
  GetCurrentBillingCycleQuery,
} from "../application/queries/billing-cycle-queries.js";

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
   * Le **brouillon** de fichier de prélèvement du cycle en cours.
   *
   * `GET` : rien n'est clôturé, aucun lot n'est créé, aucune commande n'est
   * marquée. Deux appels rendent le même fichier.
   *
   * 🔴 Le nom du fichier ET son en-tête portent l'avertissement. Le bloc
   * débiteur ne peut pas être rempli — ni IBAN ni RUM n'existent encore — et le
   * rendu y écrit des marqueurs qu'aucun schéma n'accepte plutôt que des
   * valeurs plausibles. Un lot incomplet qui ressemble à un lot valide est
   * exactement ce qui finit déposé un vendredi soir.
   *
   * Répond **409** si l'entité ne peut pas encaisser : c'est `creditorSnapshot()`
   * qui refuse, en nommant ce qui manque.
   */
  @Get("draft.xml")
  @Header("Content-Type", "application/xml; charset=utf-8")
  async draft(
    @Query("legalEntityId") legalEntityId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.queries.execute<ExportCycleDraftQuery, CycleDraftFile>(
      new ExportCycleDraftQuery(legalEntityId),
    );
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(file.fileName, "BROUILLON-prelevement.xml")),
    );
    return file.xml;
  }
}
