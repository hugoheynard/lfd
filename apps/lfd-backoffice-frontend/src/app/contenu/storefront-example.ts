import type { PlacedBlock } from './storefront-grid';

/**
 * La composition d'exemple de l'éditeur « Vitrine », marquée comme telle à
 * l'écran : la rangée 1 d'aujourd'hui (la tuile de Noël, une carte, une
 * tuile) et la bande double de Pâques en rangée 3 — de quoi montrer les côtés
 * d'image, le cadrage « contenir », un objet partagé et un défilement.
 */
export const EXAMPLE_BLOCKS: readonly PlacedBlock[] = [
  { id: 'example-1', format: 'tile', column: 1, row: 1, shelves: ['all'], mediaSide: 'left' },
  { id: 'example-2', format: 'card', column: 3, row: 1, shelves: ['all'], mediaFit: 'contain' },
  { id: 'example-3', format: 'tile', column: 4, row: 1, shelves: ['all'], mediaSide: 'right' },
  // Pâques : la même bande sur « Tout » et « Chocolat & confiserie » (cf. le document).
  {
    id: 'example-4',
    format: 'doubleBand',
    column: 1,
    row: 3,
    shelves: ['all', 'chocolate'],
    mediaSide: 'full',
    // Plusieurs annonces qui défilent : montre la navigation et la simulation.
    contents: 'multiple',
    carousel: { nav: 'both', autoplay: true, intervalSeconds: 5, firstSeconds: 8, sampleCount: 3 },
  },
];
