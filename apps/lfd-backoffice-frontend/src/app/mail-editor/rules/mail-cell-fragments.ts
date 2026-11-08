import type { ColumnsBlock, FreeBlock } from '@lfd/mail-blocks';

/**
 * **Le rendu d'un bloc rangé dans une colonne, retrouvé dans celui de sa mise
 * en page.** Le serveur rend une mise en page d'UN fragment (`block-previews`
 * ne rend que les blocs du fil — vérifié le 2026-11-08 dans
 * `packages/mailer/src/document-blocks.ts`) : une table, une cellule `<td>`
 * par colonne, et dans chaque cellule le rendu de ses blocs, mis bout à bout,
 * un élément racine par bloc — ou rien s'il n'a rien à montrer.
 *
 * Le canevas a besoin d'un fragment PAR bloc pour en faire des éléments qu'on
 * glisse. On les retrouve sans rien deviner du style :
 *
 * 1. un bloc dont le texte est marqué (`data-free-block="<id>"`) prend
 *    l'élément racine qui porte sa marque ;
 * 2. un bloc sans marque (image, séparateur) prend, dans l'ordre, les racines
 *    restantes — SEULEMENT si leur nombre est exactement celui des blocs sans
 *    marque de la cellule ; sinon on ne sait pas, et le bloc n'a pas de
 *    fragment (le canevas montre son nom).
 *
 * Un bloc absent de la carte rendue n'a pas de fragment connu ; une chaîne
 * vide dit « rendu, mais rien à montrer ».
 */
export function cellFragments(html: string, block: ColumnsBlock): ReadonlyMap<string, string> {
  const fragments = new Map<string, string>();
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const row = body.querySelector('table')?.rows[0];
  if (row === undefined) {
    return fragments;
  }
  block.cells.forEach((cell, index) => {
    const td = row.cells[index];
    if (td !== undefined) {
      matchCell(cell, [...td.children], fragments);
    }
  });
  return fragments;
}

function matchCell(
  cell: readonly FreeBlock[],
  roots: readonly Element[],
  fragments: Map<string, string>,
): void {
  const claimed = new Set<Element>();
  const unmarked: FreeBlock[] = [];
  for (const block of cell) {
    if (!hasText(block)) {
      unmarked.push(block);
      continue;
    }
    const root = roots.find((candidate) => carries(candidate, block.id));
    if (root === undefined) {
      fragments.set(block.id, '');
    } else {
      claimed.add(root);
      fragments.set(block.id, root.outerHTML);
    }
  }
  const rest = roots.filter((root) => !claimed.has(root));
  if (rest.length === unmarked.length) {
    unmarked.forEach((block, index) => fragments.set(block.id, rest[index]?.outerHTML ?? ''));
  }
}

// Les blocs dont le serveur marque le texte — les seuls qu'on retrouve par leur marque.
function hasText(block: FreeBlock): boolean {
  return block.kind !== 'image' && block.kind !== 'divider';
}

function carries(root: Element, blockId: string): boolean {
  // Comparé valeur à valeur : un identifiant n'a pas à être échappé en sélecteur.
  return [root, ...root.querySelectorAll('[data-free-block]')].some(
    (element) => element.getAttribute('data-free-block') === blockId,
  );
}
