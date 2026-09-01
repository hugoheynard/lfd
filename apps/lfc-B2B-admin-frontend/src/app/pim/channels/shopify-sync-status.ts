import type { SyncStatus } from '@lfd/pim-contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/**
 * **Où en est la diffusion d'une fiche vers Shopify** — le second axe de son
 * état, et le seul écran qui le montrait était la liste.
 *
 * Une fiche a DEUX états, pas un : ce que le catalogue a décidé d'elle
 * (brouillon / publiée / archivée) et ce qui est réellement parti chez un canal.
 * Le premier se décide sur la fiche, le second est un push manuel, sur un autre
 * écran. La fiche ne montrait que le premier, si bien que « Publiée » se lisait
 * comme un aboutissement alors qu'il ne s'était encore rien passé — la section
 * « Diffusion par canal » l'écrivait elle-même : « l'état de synchronisation …
 * viendra ici » (audit 2026-09-01, §4).
 *
 * ⚠️ **Shopify, et Shopify seul.** Le canal B2B n'expose pas d'état par produit
 * — il n'a qu'une route de push — donc rien ici ne parle de lui. Un libellé
 * « diffusion » ferait exactement la faute qu'on répare : promettre plus que ce
 * qu'on regarde. Le jour où le B2B rendra ses liaisons, ce module gagnera son
 * axe ; d'ici là, l'écran nomme le canal.
 */
const SYNC_LABELS: Readonly<Record<SyncStatus, string>> = {
  never_pushed: 'jamais poussé',
  up_to_date: 'à jour',
  drifted: 'en écart',
  failed: 'échec',
};

const SYNC_VARIANTS: Readonly<Record<SyncStatus, FoldBadgeVariant>> = {
  never_pushed: 'neutral',
  up_to_date: 'success',
  drifted: 'warning',
  failed: 'alert',
};

/** Le libellé français d'un état de synchronisation Shopify. */
export function syncStatusLabel(status: SyncStatus): string {
  return SYNC_LABELS[status];
}

/** La teinte de pastille d'un état de synchronisation Shopify. */
export function syncStatusVariant(status: SyncStatus): FoldBadgeVariant {
  return SYNC_VARIANTS[status];
}

/**
 * Ce que l'état veut dire pour quelqu'un qui vient de publier.
 *
 * `null` quand la phrase n'apprendrait rien : « à jour » se suffit. Les trois
 * autres méritent d'être dites, parce qu'elles signifient toutes que ce qu'on
 * voit à l'écran n'est pas ce que le client voit.
 */
export function syncStatusHint(status: SyncStatus): string | null {
  switch (status) {
    case 'never_pushed':
      return 'Rien n’est encore parti : la boutique ne la connaît pas.';
    case 'drifted':
      return 'La boutique porte une version antérieure : un push la rattrapera.';
    case 'failed':
      return 'Le dernier push a échoué : la boutique n’a pas reçu cette version.';
    case 'up_to_date':
      return null;
  }
}
