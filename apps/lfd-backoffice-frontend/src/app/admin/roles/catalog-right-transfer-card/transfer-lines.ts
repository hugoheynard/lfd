import type {
  CatalogRightGap,
  CatalogRightTransferView,
  StaffAction,
  StaffOverrideEffect,
} from '@lfd/contracts';

/** Ce qu'il reste à faire, dit à qui règle les rôles. */
const GAP_LABELS: Readonly<Record<CatalogRightGap, string>> = {
  none: 'Fait',
  catalog_missing: 'Catalogue publié à accorder — sinon l’accès est perdu à la bascule',
  revoke_not_copied: 'Retrait à recopier — sinon l’accès est GAGNÉ à la bascule',
  level_mismatch: 'Niveaux différents : aligner Catalogue publié',
  effect_mismatch: 'Effets différents : aligner Catalogue publié',
  legacy_still_held: 'Recopié — reste à retirer Catalogue vendu',
  unreadable_grants: 'Droits illisibles : rouvrir le rôle',
};

const LEVEL_LABELS: Readonly<Record<StaffAction, string>> = {
  read: 'lecture',
  write: 'écriture',
};

const EFFECT_LABELS: Readonly<Record<StaffOverrideEffect, string>> = {
  allow: 'accordé',
  deny: 'retiré',
};

/** Une ligne de l'aperçu, prête à peindre. */
export interface TransferLine {
  readonly key: string;
  readonly who: string;
  readonly held: string;
  readonly todo: string;
  readonly done: boolean;
}

function levelOf(level: StaffAction | null): string {
  return level === null ? '—' : LEVEL_LABELS[level];
}

function effectOf(effect: StaffOverrideEffect | null): string {
  return effect === null ? '—' : EFFECT_LABELS[effect];
}

/**
 * Rôles puis dérogations, dans l'ordre que le serveur a choisi. « Vendu » et
 * « publié » sont les libellés des deux droits à l'écran des rôles.
 */
export function transferLines(view: CatalogRightTransferView): readonly TransferLine[] {
  const roles = view.roles.map((line): TransferLine => ({
    key: `role:${line.key}`,
    who: line.archived ? `Rôle ${line.label} (archivé)` : `Rôle ${line.label}`,
    held: `vendu : ${levelOf(line.legacyLevel)} · publié : ${levelOf(line.catalogLevel)}`,
    todo: GAP_LABELS[line.gap],
    done: line.gap === 'none',
  }));
  const overrides = view.overrides.map((line): TransferLine => ({
    key: `override:${line.staffUserId}:${line.action}`,
    who: `${line.staffName} — dérogation en ${LEVEL_LABELS[line.action]}`,
    held: `vendu : ${effectOf(line.legacyEffect)} · publié : ${effectOf(line.catalogEffect)}`,
    todo: GAP_LABELS[line.gap],
    done: line.gap === 'none',
  }));
  return [...roles, ...overrides];
}

/** Le nombre de lignes qui restent à traiter. */
export function pendingCount(view: CatalogRightTransferView): number {
  return transferLines(view).filter((line) => !line.done).length;
}
