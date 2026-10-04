import { describe, expect, it } from 'vitest';

import {
  canDragLine,
  containerTitle,
  isLineInContainers,
  isListed,
  piecesLabel,
} from './container-board';

describe('la colonne Contenants (K2b), en fonctions pures', () => {
  it('ne bascule que sur `listed` : une feuille sans mode garde l’ancien écran', () => {
    expect(isListed({ containerMode: 'listed' })).toBe(true);
    expect(isListed({ containerMode: 'counted' })).toBe(false);
    expect(isListed({})).toBe(false);
  });

  it('dit une ligne « au bac » quand toute sa quantité est répartie, lu sur le serveur', () => {
    expect(isLineInContainers({ quantity: 20, unallocated: 0 })).toBe(true);
    expect(isLineInContainers({ quantity: 20, unallocated: 10 })).toBe(false);
    // Absent : on ne devine pas.
    expect(isLineInContainers({ quantity: 20 })).toBe(false);
  });

  it('ne laisse glisser qu’une ligne dont il reste des pièces et qui est sortie du four', () => {
    expect(canDragLine({ unallocated: 3, awaitingProduction: false })).toBe(true);
    expect(canDragLine({ unallocated: 0, awaitingProduction: false })).toBe(false);
    expect(canDragLine({ unallocated: 3, awaitingProduction: true })).toBe(false);
  });

  it('nomme un contenant par son libellé servi, et sa moitié', () => {
    expect(containerTitle({ label: 'A3K', binHalf: 'left' })).toBe('A3K · ½ gauche');
    expect(containerTitle({ label: 'Sac 2', binHalf: null })).toBe('Sac 2');
    expect(piecesLabel(0)).toBe('vide');
    expect(piecesLabel(1)).toBe('1 pièce');
    expect(piecesLabel(12)).toBe('12 pièces');
  });
});
