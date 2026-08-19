import { describe, expect, it } from 'vitest';
import type { NodeHealth } from '@lfd/ops-contract';

import { layoutOf } from '../layout';

const node = (id: string, dependsOn: string[] = []): NodeHealth => ({
  node: id,
  kind: 'service',
  label: id,
  status: 'unknown',
  reason: 'no-evidence',
  since: '2026-08-19T12:00:00.000Z',
  lastHeartbeatAt: null,
  dependsOn,
  readings: [],
});

describe('layoutOf', () => {
  it('range de gauche à droite dans le sens « dépend de »', () => {
    // C'est le sens de lecture de la causalité, celui qu'on suit quand on
    // cherche qui a fait tomber quoi.
    const layout = layoutOf([node('gateway', ['b2b']), node('b2b', ['db']), node('db')]);
    const column = (id: string): number | undefined =>
      layout.nodes.find((placed) => placed.health.node === id)?.column;

    expect(column('gateway')).toBe(0);
    expect(column('b2b')).toBe(1);
    expect(column('db')).toBe(2);
  });

  it("n'émet pas d'arête vers un nœud absent de la carte", () => {
    // Un trait vers un nœud qui n'est pas rendu laisserait une ligne pendante à
    // travers l'écran, sans jamais dire qu'elle est pendante.
    const layout = layoutOf([node('b2b', ['fantome'])]);

    expect(layout.edges).toEqual([]);
  });

  it('survit à un cycle plutôt que de figer la page', () => {
    // La topologie est écrite à la main : un aller-retour accidentel ferait
    // boucler le rendu à l'infini. Une carte de santé qui gèle l'onglet serait
    // une jolie ironie.
    const layout = layoutOf([node('a', ['b']), node('b', ['a'])]);

    expect(layout.nodes).toHaveLength(2);
  });

  it('empile dans la même colonne ce qui a la même profondeur', () => {
    const layout = layoutOf([node('gw', ['a', 'b']), node('a'), node('b')]);
    const second = layout.nodes.filter((placed) => placed.column === 1);

    expect(second.map((placed) => placed.row)).toEqual([0, 1]);
    expect(layout.rows).toBe(2);
  });
});
