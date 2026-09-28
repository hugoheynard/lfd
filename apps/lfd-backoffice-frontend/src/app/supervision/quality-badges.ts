import type {
  QualityBoardView,
  QualityLineStatus,
  QualityOrderStatus,
  QualityTargetPayload,
  QualityVerdictCode,
} from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/**
 * **Les pastilles du contrôle qualité** (`plan-controle-qualite.md`, D5, D7).
 * Fonctions pures : la page les pose, les colonnes les lisent.
 *
 * L'état se DIT en toutes lettres — « Réserve », « Bloquant », « À revoir » —,
 * la couleur ne fait que le redoubler.
 */
export interface QualityBadge {
  /** Du moins grave au plus grave : c'est l'ordre de « la pire pastille ». */
  readonly rank: number;
  readonly label: string;
  readonly variant: FoldBadgeVariant;
  /** « Contrôlé sur 96, compte actuel 120 — à revoir », ou `null` si le verdict vaut encore. */
  readonly detail: string | null;
}

/** Les mots d'un verdict : `warning` se dit « Réserve » à l'écran (§0). */
export const VERDICT_LABELS: Readonly<Record<QualityVerdictCode, string>> = {
  ok: 'OK',
  warning: 'Réserve',
  blocking: 'Bloquant',
};

export const VERDICT_VARIANTS: Readonly<Record<QualityVerdictCode, FoldBadgeVariant>> = {
  ok: 'success',
  warning: 'warning',
  blocking: 'alert',
};

const RANK = { ok: 0, warning: 1, stale: 2, blocking: 3 } as const;

function verdictBadge(verdict: QualityVerdictCode): QualityBadge {
  return {
    rank: RANK[verdict],
    label: `Contrôle · ${VERDICT_LABELS[verdict]}`,
    variant: VERDICT_VARIANTS[verdict],
    detail: null,
  };
}

/**
 * La phrase de la péremption (D5). Le compte actuel peut manquer : le produit a
 * quitté le compte du jour.
 */
export function staleDetail(status: QualityLineStatus): string {
  const now =
    status.currentQuantity === null
      ? 'le produit a quitté le compte'
      : `compte actuel ${String(status.currentQuantity)}`;
  return `Contrôlé sur ${String(status.quantitySeen)}, ${now} — à revoir`;
}

/**
 * La pastille d'une ligne. Périmée, elle dit « À revoir » — sauf un blocage :
 * ⚠️ un blocage périmé RESTE bloquant (D5), il le dit donc d'abord.
 */
export function lineBadge(status: QualityLineStatus): QualityBadge {
  if (!status.stale) {
    return verdictBadge(status.verdict);
  }
  if (status.verdict === 'blocking') {
    return {
      ...verdictBadge('blocking'),
      label: 'Contrôle · Bloquant, à revoir',
      detail: staleDetail(status),
    };
  }
  return {
    rank: RANK.stale,
    label: 'Contrôle · À revoir',
    variant: 'warning',
    detail: staleDetail(status),
  };
}

export function orderBadge(status: QualityOrderStatus): QualityBadge {
  return verdictBadge(status.verdict);
}

/** La pire pastille d'un ensemble — celle d'un rayon replié ; `null` si rien n'est contrôlé. */
export function worstBadge(badges: readonly (QualityBadge | null)[]): QualityBadge | null {
  let worst: QualityBadge | null = null;
  for (const badge of badges) {
    if (badge !== null && (worst === null || badge.rank > worst.rank)) {
      worst = badge;
    }
  }
  return worst;
}

/** Les pastilles d'une journée, indexées pour les colonnes. */
export interface QualityLookup {
  /** Par SKU du compte. */
  readonly lines: ReadonlyMap<string, QualityBadge>;
  /** Par numéro de commande — la clé que le colisage connaît. */
  readonly orders: ReadonlyMap<string, QualityBadge>;
}

export const NO_QUALITY: QualityLookup = { lines: new Map(), orders: new Map() };

export function qualityLookup(board: QualityBoardView | null): QualityLookup {
  if (board === null) {
    return NO_QUALITY;
  }
  return {
    lines: new Map(board.lines.map((status) => [status.sku, lineBadge(status)])),
    orders: new Map(
      board.orders
        .filter(
          (status): status is QualityOrderStatus & { reference: string } =>
            status.reference !== null,
        )
        .map((status) => [status.reference, orderBadge(status)]),
    ),
  };
}

/** Ce qu'une colonne demande à contrôler — la cible, et les mots du panneau. */
export interface QualityRequest {
  readonly target: QualityTargetPayload;
  /** « Pain au chocolat », « Traiteur Vermeil ». */
  readonly title: string;
  /** « 96 pièces au compte », « Commande CMD-1 ». */
  readonly subtitle: string;
}
