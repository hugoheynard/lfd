import { Injectable } from "@nestjs/common";

import {
  SaleSkuAliasResolutionLog,
  type SaleReferenceEntry,
} from "../domain/ports/sale-sku-alias-resolution.log.js";
import { SaleSkuAliasReader } from "../domain/ports/sale-sku-alias.reader.js";
import type { SaleSkuAliasPair } from "../domain/sale-sku-aliases.js";

/**
 * **La porte d'entrée des références de vente**
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 5).
 *
 * Toute référence REÇUE — passation, devis, panier gardé, brouillon — passe
 * ici avant la résolution au catalogue : une ancienne référence (`PAI-001`)
 * est remplacée par la cible de `sale_sku_alias` (`PAI-001-1`), jamais par le
 * défaut courant — un changement de défaut joué depuis ne fait donc pas
 * glisser un vieux panier. La suite du chemin ne voit que des références
 * canoniques : l'heure limite, les opérations, le prix et la ligne écrite.
 *
 * Deux lignes qui désignent le même article sortent sous la même référence ;
 * la fusion des quantités reste celle de la tarification (`OrderLinePricing`),
 * qui fusionne déjà par référence.
 *
 * 🔴 **Alias d'entrée : 90 jours** (Q1 b, § 8). Rien à couper aujourd'hui : la
 * coupure (L4) retirera cet appel des portes du panier, du brouillon et de la
 * passation quand le compte de {@link SaleSkuAliasResolutionLog} sera à zéro
 * depuis trente jours. Les liens de fiche et les lecteurs de l'historique
 * gardent l'alias à vie.
 *
 * Table vide jusqu'à la bascule (L3) : une lecture, et les lignes reçues
 * rendues telles quelles.
 */
@Injectable()
export class SaleReferenceIntake {
  constructor(
    private readonly aliases: SaleSkuAliasReader,
    private readonly resolutions: SaleSkuAliasResolutionLog,
  ) {}

  /** Les lignes, chacune sous la référence de l'article qu'elle désigne. */
  async normalized<Line extends { readonly sku: string }>(
    lines: readonly Line[],
    entry: SaleReferenceEntry,
  ): Promise<readonly Line[]> {
    if (lines.length === 0) {
      return lines;
    }
    const table = await this.aliases.around(lines.map((line) => line.sku));
    const resolved = new Map<string, SaleSkuAliasPair>();
    const normalized = lines.map((line) => {
      const targetSku = table.canonical(line.sku);
      if (targetSku === line.sku) {
        return line;
      }
      resolved.set(line.sku, { aliasSku: line.sku, targetSku });
      return { ...line, sku: targetSku };
    });
    if (resolved.size === 0) {
      return lines;
    }
    this.resolutions.record(entry, [...resolved.values()]);
    return normalized;
  }
}
