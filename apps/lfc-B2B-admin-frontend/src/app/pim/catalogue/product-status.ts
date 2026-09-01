import type { ProductStatus } from '@lfd/pim-contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/**
 * **Comment un statut de produit se montre** — le libellé et la couleur, au même
 * endroit pour tous les écrans qui l'affichent.
 *
 * Les deux tables vivaient dans la seule fiche produit. La liste, elle, peignait
 * `[content]="p.status"` — la valeur d'enum brute, en anglais — et choisissait sa
 * couleur avec `p.status === 'archived' ? 'neutral' : 'success'`. **Un brouillon
 * s'y affichait donc en vert, exactement comme un produit en ligne** : la colonne
 * « statut » ne distinguait pas les deux états qu'elle existe pour distinguer
 * (audit 2026-09-01, §9).
 *
 * `lint:code-language` ne pouvait pas le voir — il lit les identifiants, pas une
 * valeur de données interpolée dans un gabarit. Une table partagée le rend
 * inutile : il n'y a plus de chemin par lequel une valeur brute atteint l'écran.
 *
 * Des `Record<ProductStatus, …>` exhaustifs par construction : le jour où le
 * modèle gagne un état, la compilation casse ici, là où un `switch` avec
 * `default` l'aurait peint « Brouillon » en silence.
 */
const STATUS_LABELS: Readonly<Record<ProductStatus, string>> = {
  draft: 'Brouillon',
  published: 'Publié',
  archived: 'Archivé',
};

/**
 * Trois teintes pour trois états, et l'ambre du brouillon n'est pas une alerte :
 * c'est « ce n'est pas encore en vente ». Le vert est réservé à ce qui l'est.
 */
const STATUS_VARIANTS: Readonly<Record<ProductStatus, FoldBadgeVariant>> = {
  draft: 'warning',
  published: 'success',
  archived: 'neutral',
};

/** Le libellé français d'un statut de produit. */
export function productStatusLabel(status: ProductStatus): string {
  return STATUS_LABELS[status];
}

/** La teinte de pastille d'un statut de produit. */
export function productStatusVariant(status: ProductStatus): FoldBadgeVariant {
  return STATUS_VARIANTS[status];
}
