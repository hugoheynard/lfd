import { Injectable } from "@nestjs/common";

import {
  PackedResuppliesReader,
  type PackedResupplyLines,
} from "../../packing/channels/delivery/index.js";
import {
  type FrozenResupply,
  FrozenResuppliesReader,
} from "../../production/channels/delivery/index.js";
import type { InternalTransfer } from "../domain/entities/internal-transfer.js";
import type { ManifestLine } from "../domain/services/transfer-manifest.js";

/**
 * **Ce que contient un réassort dans un transfert** (réassort, lot R3c,
 * 2026-10-21 — `reassort-boutiques/plan-reapprovisionnement.md` §13.3 :
 * « l'emballé s'il est connu, sinon le demandé ») :
 *
 * - les lignes FIGÉES à l'arrêt du fournil (`production/channels/delivery/`),
 *   jamais l'état vivant du commerce ;
 * - la quantité EMBALLÉE quand la fiche du colisage est close
 *   (`packing/channels/delivery/`), sinon la quantité demandée. Une ligne
 *   emballée à zéro ne part pas : le manifeste ne porte que du positif.
 *
 * Un réassort introuvable (journée rouverte) est absent : le manifeste ne lui
 * invente pas de contenu. Deux lectures par lot et par journée, sans réseau.
 */
@Injectable()
export class TransferResupplyContents {
  constructor(
    private readonly frozen: FrozenResuppliesReader,
    private readonly packed: PackedResuppliesReader,
  ) {}

  /** Les lignes de chaque réassort de ces transferts, par réassort. */
  async linesOf(
    transfers: readonly InternalTransfer[],
  ): Promise<ReadonlyMap<string, readonly ManifestLine[]>> {
    const byDay = new Map<string, string[]>();
    for (const transfer of transfers) {
      const ids = transfer.resupplyIds;
      if (ids.length > 0) {
        byDay.set(transfer.serviceDay, [...(byDay.get(transfer.serviceDay) ?? []), ...ids]);
      }
    }
    const frozen: FrozenResupply[] = [];
    for (const [day, ids] of byDay) {
      frozen.push(...(await this.frozen.frozenOf(day, ids)));
    }
    if (frozen.length === 0) {
      return new Map();
    }
    const packed = await this.packed.packedOf(frozen.map((resupply) => resupply.resupplyId));
    return new Map(
      frozen.map((resupply) => [
        resupply.resupplyId,
        linesOf(resupply, packed.get(resupply.resupplyId) ?? null),
      ]),
    );
  }
}

function linesOf(
  resupply: FrozenResupply,
  packed: PackedResupplyLines | null,
): readonly ManifestLine[] {
  return resupply.lines.flatMap((line) => {
    const quantity = packed === null ? line.quantity : (packed.get(line.sku) ?? 0);
    return quantity > 0 ? [{ sku: line.sku, productName: line.productName, quantity }] : [];
  });
}
