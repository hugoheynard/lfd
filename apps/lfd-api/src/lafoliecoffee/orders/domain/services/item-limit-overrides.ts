import type { ExceededItemLimit } from "../../../order-cutoffs/index.js";
import {
  ItemLimitOverrideReasonInvalidError,
  ItemLimitReasonRequiredError,
} from "../errors/item-limit-override-errors.js";

/** La longueur maximale d'un motif de dépassement, en caractères. */
export const ITEM_LIMIT_OVERRIDE_REASON_MAX = 280;

/** Le geste qui a passé outre : la saisie de l'équipe, ou une modification. */
export type ItemLimitOverrideOrigin = "placement" | "revision";

/**
 * **Une limite de produit passée, consignée** : qui, pourquoi, sur quelle
 * commande, et la limite telle qu'elle jugeait. Écrite une fois, jamais
 * modifiée.
 */
export interface ItemLimitOverride {
  readonly id: string;
  readonly orderId: string;
  readonly sku: string;
  readonly staffUserId: string;
  readonly reason: string;
  /** `YYYY-MM-DD`, la journée d'acheminement. */
  readonly serviceDay: string;
  readonly daysBefore: number;
  readonly time: string;
  readonly limitAt: Date;
  readonly origin: ItemLimitOverrideOrigin;
  readonly createdAt: Date;
}

/** Une ligne de la commande, pour nommer le produit dans le refus. */
export interface NamedLine {
  readonly sku: string;
  readonly productName: string;
}

/**
 * **Le motif d'un dépassement** : exigé dès qu'une limite est passée, ignoré
 * sinon. Rend le motif nettoyé, ou `null` quand rien n'est dépassé.
 *
 * @throws {ItemLimitReasonRequiredError} une limite passée, aucun motif.
 * @throws {ItemLimitOverrideReasonInvalidError} un motif vide ou trop long.
 */
export function justifyItemLimitOverrides(
  exceeded: readonly ExceededItemLimit[],
  reason: string | undefined,
  lines: readonly NamedLine[],
): string | null {
  if (exceeded.length === 0) {
    return null;
  }
  if (reason === undefined) {
    throw new ItemLimitReasonRequiredError(
      exceeded.map((passed) => ({
        productName: lines.find((line) => line.sku === passed.sku)?.productName ?? passed.sku,
        daysBefore: passed.rule.daysBefore,
        time: passed.rule.time,
      })),
    );
  }
  const trimmed = reason.trim();
  if (trimmed.length === 0 || trimmed.length > ITEM_LIMIT_OVERRIDE_REASON_MAX) {
    throw new ItemLimitOverrideReasonInvalidError(ITEM_LIMIT_OVERRIDE_REASON_MAX);
  }
  return trimmed;
}

/** Ce qu'il faut pour consigner les dépassements d'une commande écrite. */
export interface OverrideRecording {
  readonly exceeded: readonly ExceededItemLimit[];
  readonly orderId: string;
  readonly staffUserId: string;
  readonly reason: string;
  readonly serviceDay: string;
  readonly origin: ItemLimitOverrideOrigin;
  readonly at: Date;
  readonly nextId: () => string;
}

/** Une trace par SKU dépassé, dans l'ordre du panier. */
export function itemLimitOverridesOf(recording: OverrideRecording): readonly ItemLimitOverride[] {
  return recording.exceeded.map((passed) => ({
    id: recording.nextId(),
    orderId: recording.orderId,
    sku: passed.sku,
    staffUserId: recording.staffUserId,
    reason: recording.reason,
    serviceDay: recording.serviceDay,
    daysBefore: passed.rule.daysBefore,
    time: passed.rule.time,
    limitAt: passed.limit,
    origin: recording.origin,
    createdAt: recording.at,
  }));
}
