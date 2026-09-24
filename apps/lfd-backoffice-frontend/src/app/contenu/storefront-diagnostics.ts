import type { StorefrontContent } from '@lfd/contracts';
import { describeFormat, isRenderable, type ShelfKey } from '@lfd/storefront-layout';

import { type EditorBlock, itemsOf } from './storefront-block';
import { ALL_SHELVES, type ShelfOption, type StorefrontCatalog } from './storefront-catalog';
import { infoIssues } from './storefront-text';

/**
 * Ce que l'éditeur dit de la composition sans la modifier : les rayons qu'il
 * propose, les contenus qu'on ne peut pas encore envoyer, les objets qui
 * rendent leurs cases au rayon. Des fonctions pures, que le store enveloppe
 * dans ses `computed` — elles se testent sans Angular.
 */

/**
 * Les rayons proposés : ceux du catalogue ; sans catalogue, ceux que la
 * vitrine vise déjà, « Tout » en tête, nommés par leur clé faute de mieux.
 */
export function shelfOptionsOf(
  catalog: StorefrontCatalog | null,
  used: readonly ShelfKey[],
): readonly ShelfOption[] {
  if (catalog !== null) {
    return catalog.shelves;
  }
  const keys = new Set([ALL_SHELVES, ...used]);
  return [...keys].map((key) => ({ key, label: key === ALL_SHELVES ? 'Tout' : key }));
}

/**
 * Les contenus qu'on ne peut pas encore envoyer — un titre manquant, un texte
 * trop long —, nommés par leur objet. Tant qu'il y en a, Enregistrer reste
 * fermé : le serveur refuserait la vitrine entière pour l'un d'eux.
 */
export function contentIssuesOf(
  blocks: readonly EditorBlock[],
  shelfLabel: (key: ShelfKey) => string,
): readonly string[] {
  return blocks.flatMap((block) =>
    itemsOf(block).flatMap((item, index) =>
      item.kind === 'info'
        ? infoIssues(item).map(
            (issue) =>
              `« ${describeFormat(block.format)} » (${block.shelves.map(shelfLabel).join(', ')}, ` +
              `colonne ${block.column}, rangée ${block.row}), contenu ${index + 1} : ${issue}`,
          )
        : [],
    ),
  );
}

/**
 * Les objets qui n'ont rien à montrer — aucun contenu, un article retiré, une
 * info sans titre. La boutique rend leurs cases au rayon (« aucune case n'est
 * jamais vide », `boutique-rayon-layout.md`) ; l'éditeur le dit sur l'objet.
 * Sans catalogue, on ne sait pas quels articles sont retirés : on n'en déclare
 * aucun, et seuls le vide et l'info sans titre comptent.
 */
export function returnedIdsOf(
  blocks: readonly EditorBlock[],
  catalog: StorefrontCatalog | null,
): ReadonlySet<string> {
  const served = catalog === null ? null : new Set(catalog.products.map((p) => p.sku));
  return new Set(
    blocks
      .filter((block) => {
        const contents = itemsOf(block);
        return !isRenderable({ contents }, served ?? skusOf(contents));
      })
      .map((block) => block.id),
  );
}

function skusOf(contents: readonly StorefrontContent[]): ReadonlySet<string> {
  return new Set(contents.flatMap((item) => (item.kind === 'product' ? [item.sku] : [])));
}
