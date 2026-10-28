import { Injectable } from "@nestjs/common";

import { isUniqueViolation } from "../../platform/database/json-columns.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { currentTransaction } from "../../platform/database/transaction.store.js";
import { TechnicalError } from "../../platform/shared/errors/app-error.js";
import { BatchShortcut, type BatchShortcutState } from "../domain/entities/batch-shortcut.js";
import { ProductBatchShortcuts } from "../domain/entities/product-batch-shortcuts.js";
import { DuplicateBatchShortcutLabelError } from "../domain/errors/batch-shortcut-errors.js";
import { BatchShortcutRepository } from "../domain/ports/batch-shortcut.repository.js";

/** L'espace de noms du verrou : aucune autre clé consultative ne le porte. */
const SHORTCUT_LOCK_NAMESPACE = "production_batch_shortcut:";

/** Le chargement demandé hors d'une unité de travail : un défaut de code, pas un refus. */
class ShortcutLockOutsideTransactionError extends TechnicalError {
  constructor(sku: string) {
    super(
      "production.batch_shortcut.lock_outside_transaction",
      `Les raccourcis du produit ${sku} ont été chargés hors d'une unité de travail : leur verrou serait relâché aussitôt pris. Rien n'a été écrit ; signalez-le à l'équipe technique.`,
    );
  }
}

interface ShortcutRow {
  readonly id: string;
  readonly sku: string;
  readonly label: string;
  readonly pieces: number;
  readonly position: number;
  readonly createdByStaffId: string;
  readonly createdByName: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly removedAt: Date | null;
}

function toDomain(row: ShortcutRow): BatchShortcut {
  return BatchShortcut.restore({
    id: row.id,
    sku: row.sku,
    label: row.label,
    pieces: row.pieces,
    position: row.position,
    createdBy: { staffUserId: row.createdByStaffId, name: row.createdByName },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    removedAt: row.removedAt,
  });
}

function toPersistence(state: BatchShortcutState): ShortcutRow {
  return {
    id: state.id,
    sku: state.sku,
    label: state.label,
    pieces: state.pieces,
    position: state.position,
    createdByStaffId: state.createdBy.staffUserId,
    createdByName: state.createdBy.name,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    removedAt: state.removedAt,
  };
}

/**
 * Le dépôt des raccourcis du fournil (plan `fournil/plan-raccourcis-du-fournil.md`,
 * S1). Le chargement prend `pg_advisory_xact_lock` sur le produit, tenu
 * jusqu'au `COMMIT` : deux ajouts concurrents se suivent, et le plafond que
 * l'agrégat compte reste vrai. La sauvegarde écrit chaque raccourci touché
 * en entier — au plus six lignes.
 */
@Injectable()
export class PrismaBatchShortcutRepository extends BatchShortcutRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async loadForSku(sku: string): Promise<ProductBatchShortcuts> {
    await this.lock(sku);
    const rows = await this.prisma.productionBatchShortcut.findMany({
      where: { sku, removedAt: null },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    return ProductBatchShortcuts.restore(sku, rows.map(toDomain));
  }

  async loadHolding(shortcutId: string): Promise<ProductBatchShortcuts | null> {
    const row = await this.prisma.productionBatchShortcut.findFirst({
      where: { id: shortcutId, removedAt: null },
      select: { sku: true },
    });
    if (row === null) {
      return null;
    }
    const product = await this.loadForSku(row.sku);
    // Retiré entre la lecture et le verrou : il n'est plus à personne.
    return product.shortcuts.some((shortcut) => shortcut.id === shortcutId) ? product : null;
  }

  async save(product: ProductBatchShortcuts): Promise<void> {
    for (const shortcut of product.changed) {
      await this.write(toPersistence(shortcut.snapshot()));
    }
  }

  private async write(row: ShortcutRow): Promise<void> {
    try {
      await this.prisma.productionBatchShortcut.upsert({
        where: { id: row.id },
        create: row,
        update: {
          label: row.label,
          pieces: row.pieces,
          updatedAt: row.updatedAt,
          removedAt: row.removedAt,
        },
      });
    } catch (error) {
      // L'index `(sku, lower(label))` des vivants : sous le verrou, il ne
      // devrait jamais sauter — s'il saute, c'est un doublon, pas une panne.
      if (isUniqueViolation(error)) {
        throw new DuplicateBatchShortcutLabelError(row.sku, row.label);
      }
      throw error;
    }
  }

  private async lock(sku: string): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new ShortcutLockOutsideTransactionError(sku);
    }
    const key = `${SHORTCUT_LOCK_NAMESPACE}${sku}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}
