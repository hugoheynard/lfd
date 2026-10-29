import { Injectable, Logger } from "@nestjs/common";

import {
  SaleSkuAliasResolutionLog,
  type SaleReferenceEntry,
} from "../domain/ports/sale-sku-alias-resolution.log.js";
import type { SaleSkuAliasPair } from "../domain/sale-sku-aliases.js";

/**
 * Le marqueur que l'on cherche dans les journaux pour compter les résolutions
 * d'alias à l'entrée — et décider de la fin de l'alias d'entrée (L4).
 */
export const SALE_SKU_ALIAS_RESOLVED = "sale_sku_alias.resolved";

/**
 * **Le compte des résolutions, dans les journaux de l'application.**
 *
 * En `warn` et pas en `log` : seuls `error` et `warn` sont gardés dans le
 * tampon que la carte de santé lit (`RecordingLogger`) — c'est le seul endroit
 * où on peut les compter depuis un container aujourd'hui. Une résolution est
 * d'ailleurs un signal à faire tendre vers zéro : un vieux panier, un vieux
 * brouillon, un client qui n'a pas rechargé.
 */
@Injectable()
export class LoggedSaleSkuAliasResolutionLog extends SaleSkuAliasResolutionLog {
  private readonly logger = new Logger(SALE_SKU_ALIAS_RESOLVED);

  record(entry: SaleReferenceEntry, resolved: readonly SaleSkuAliasPair[]): void {
    const pairs = resolved.map((pair) => `${pair.aliasSku}→${pair.targetSku}`).join(", ");
    this.logger.warn(
      `${SALE_SKU_ALIAS_RESOLVED} entry=${entry} count=${String(resolved.length)} ${pairs}`,
    );
  }
}
