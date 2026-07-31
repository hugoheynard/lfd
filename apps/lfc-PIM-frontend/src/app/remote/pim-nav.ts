import type { FoldViewNavItem } from 'fold-ng';

/**
 * Le menu du PIM en **donnée**, `link` relatif au point de montage (`produits`
 * → `/pim/produits`, préfixé par le shell). En standalone c'est le rail
 * (`app.html`) qui navigue ; en fédéré, ce même contenu alimente le nav-in-content
 * (`PimRemoteShell`). La déconnexion n'est PAS ici : c'est une action du shell.
 */
export const PIM_NAV: FoldViewNavItem[] = [
  { key: 'produits', label: 'Produits', icon: 'grid', link: 'produits' },
  { key: 'categories', label: 'Catégories', icon: 'folder', link: 'categories' },
  { key: 'tva', label: 'Régimes de TVA', icon: 'sliders', link: 'tva' },
  { key: 'collections', label: 'Collections', icon: 'org-chart', link: 'collections' },
  { key: 'publication', label: 'Publication', icon: 'upload', link: 'publication' },
  { key: 'emplacements', label: 'Emplacements', icon: 'company', link: 'emplacements' },
  { key: 'integration', label: 'Intégrations', icon: 'shopify', link: 'integration' },
  { key: 'documentation', label: 'Documentation', icon: 'library', link: 'documentation' },
  { key: 'reglages', label: 'Réglages', icon: 'settings', link: 'reglages' },
];
