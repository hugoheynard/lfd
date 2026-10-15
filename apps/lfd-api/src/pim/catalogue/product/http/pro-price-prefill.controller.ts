import { Controller, Get, HttpCode, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { ProPricePrefillPreviewView } from "@lfd/pim-contracts";

import {
  AdminSurface,
  RequirePermission,
} from "../../../../platform/auth/admin-surface.decorator.js";
import { ApplyProPricePrefillCommand } from "../application/apply-pro-price-prefill.js";
import { PreviewProPricePrefillQuery } from "../application/preview-pro-price-prefill.js";

/**
 * **Le pré-remplissage du prix pro saisi** (lot P, P5 de
 * `plan-catalogue-synchronise-par-audience.md`) — dans le voisinage des règles
 * comptables (`/pim/accounting-rules/…`), et sous leur droit `pim_tax` : c'est
 * le geste qui prépare la bascule de méthode, une décision comptable.
 *
 * Le contrôleur vit dans le catalogue et non dans `accounting-rules/` : le
 * geste écrit des FICHES, par leur agrégat, et le catalogue importe déjà les
 * règles comptables — l'inverse ferait un cycle de modules.
 */
@AdminSurface("pim_tax")
@Controller("accounting-rules/pro-price-prefill")
export class ProPricePrefillController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** L'aperçu (`dryRun`) — lecture seule. */
  @Get()
  preview(): Promise<ProPricePrefillPreviewView> {
    return this.queries.execute<PreviewProPricePrefillQuery, ProPricePrefillPreviewView>(
      new PreviewProPricePrefillQuery(),
    );
  }

  /**
   * L'écriture (`apply`) — un geste d'ÉCRITURE, dit explicitement plutôt que
   * laissé à la déduction du verbe. Rend l'aperçu relu : il ne compte plus
   * rien à pré-remplir si tout s'est écrit.
   */
  @Post()
  @HttpCode(200)
  @RequirePermission("pim_tax:write")
  async apply(): Promise<ProPricePrefillPreviewView> {
    await this.commands.execute<ApplyProPricePrefillCommand, void>(
      new ApplyProPricePrefillCommand(),
    );
    return this.queries.execute<PreviewProPricePrefillQuery, ProPricePrefillPreviewView>(
      new PreviewProPricePrefillQuery(),
    );
  }
}
