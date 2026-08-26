import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { readLegacyChannelsColumn } from "./json-readers.js";
import { channelKeys, pairsOfLegacy } from "../domain/value-objects/sales-channels.js";

/** Un objet dont les deux écritures divergent, et par quoi. */
export interface ChannelDrift {
  readonly id: string;
  /** Vendu selon la colonne héritée, absent des tables. */
  readonly onlyInColumn: readonly string[];
  /** Vendu selon les tables, absent de la colonne héritée. */
  readonly onlyInTable: readonly string[];
}

export interface ChannelParityReport {
  readonly categoriesChecked: number;
  readonly productsChecked: number;
  readonly categories: readonly ChannelDrift[];
  readonly products: readonly ChannelDrift[];
  /** Vrai si les deux écritures disent la même chose partout. */
  readonly identical: boolean;
}

function driftOf(
  id: string,
  column: readonly string[],
  table: readonly string[],
): ChannelDrift | null {
  const inTable = new Set(table);
  const inColumn = new Set(column);
  const onlyInColumn = column.filter((key) => !inTable.has(key));
  const onlyInTable = table.filter((key) => !inColumn.has(key));
  if (onlyInColumn.length === 0 && onlyInTable.length === 0) {
    return null;
  }
  return { id, onlyInColumn, onlyInTable };
}

/**
 * **La colonne héritée et les tables disent-elles la même chose ?**
 *
 * Pendant la bascule C0-d, la matrice de canaux s'écrit à deux endroits : les
 * tables `category_channel` / `product_channel`, désormais lues, et les colonnes
 * `jsonb` qui restent écrites pour le binaire précédent. Tant que les deux
 * coexistent, l'écart entre elles est la seule chose qui puisse rendre la
 * tranche d-3 dangereuse — supprimer les colonnes fige alors une vérité qui
 * n'était pas la bonne.
 *
 * Une fenêtre les rend possibles : la migration remplit les tables depuis le
 * `jsonb`, puis le container redémarre. Entre les deux, l'ancien binaire tourne
 * encore et n'écrit que la colonne. Une famille modifiée là aurait ses canaux
 * vides pour le nouveau code, sans qu'aucune erreur ne le dise.
 *
 * Ce lecteur ne compare que des **clés** (`lieu contexte`) : aucun nom, aucun
 * prix, aucune donnée client ne sort d'ici.
 */
@Injectable()
export class ChannelParityReader {
  constructor(private readonly prisma: PimPrismaService) {}

  async report(): Promise<ChannelParityReport> {
    const categories = await this.categoryDrifts();
    const products = await this.productDrifts();
    return {
      categoriesChecked: categories.checked,
      productsChecked: products.checked,
      categories: categories.drifts,
      products: products.drifts,
      identical: categories.drifts.length === 0 && products.drifts.length === 0,
    };
  }

  private async categoryDrifts(): Promise<{ checked: number; drifts: ChannelDrift[] }> {
    const rows = await this.prisma.category.findMany({
      select: {
        id: true,
        channelPreset: true,
        channels: { select: { locationId: true, contextKey: true } },
      },
    });
    const drifts: ChannelDrift[] = [];
    for (const row of rows) {
      const column = channelKeys(
        pairsOfLegacy(readLegacyChannelsColumn(row.channelPreset, "category.channelPreset")),
      );
      const table = channelKeys(
        row.channels.map((cell) => ({ locationId: cell.locationId, context: cell.contextKey })),
      );
      const drift = driftOf(row.id, column, table);
      if (drift !== null) {
        drifts.push(drift);
      }
    }
    return { checked: rows.length, drifts };
  }

  private async productDrifts(): Promise<{ checked: number; drifts: ChannelDrift[] }> {
    const rows = await this.prisma.product.findMany({
      select: {
        id: true,
        channelOverride: true,
        channelOverrideRows: {
          select: { cells: { select: { locationId: true, contextKey: true } } },
        },
      },
    });
    const drifts: ChannelDrift[] = [];
    for (const row of rows) {
      // « Hérite » des deux côtés : rien à comparer. Une seule des deux formes
      // qui dit « déroge » est en revanche une divergence franche — c'est le
      // cas que la ligne parente existe précisément pour distinguer.
      const columnOverrides = row.channelOverride !== null;
      const tableOverrides = row.channelOverrideRows !== null;
      if (!columnOverrides && !tableOverrides) {
        continue;
      }
      if (columnOverrides !== tableOverrides) {
        drifts.push({
          id: row.id,
          onlyInColumn: columnOverrides ? ["<déroge>"] : [],
          onlyInTable: tableOverrides ? ["<déroge>"] : [],
        });
        continue;
      }
      const column = channelKeys(
        pairsOfLegacy(readLegacyChannelsColumn(row.channelOverride, "product.channelOverride")),
      );
      const table = channelKeys(
        (row.channelOverrideRows?.cells ?? []).map((cell) => ({
          locationId: cell.locationId,
          context: cell.contextKey,
        })),
      );
      const drift = driftOf(row.id, column, table);
      if (drift !== null) {
        drifts.push(drift);
      }
    }
    return { checked: rows.length, drifts };
  }
}
