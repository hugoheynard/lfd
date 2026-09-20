import { describe, expect, it } from 'vitest';
import type { NodeHealth, NodeKind } from '@lfd/ops-contract';

import { layoutOf, type MapLayout } from '../layout';

const node = (id: string, dependsOn: string[] = [], kind: NodeKind = 'service'): NodeHealth => ({
  node: id,
  kind,
  label: id,
  status: 'unknown',
  reason: 'no-evidence',
  since: '2026-08-19T12:00:00.000Z',
  lastHeartbeatAt: null,
  dependsOn,
  readings: [],
});

describe('layoutOf', () => {
  it('range en bandes dans le sens « dépend de »', () => {
    // C'est le sens de lecture de la causalité, celui qu'on suit quand on
    // cherche qui a fait tomber quoi.
    const layout = layoutOf([node('gateway', ['b2b']), node('b2b', ['db']), node('db')]);

    expect(column(layout, 'gateway')).toBe(0);
    expect(column(layout, 'b2b')).toBe(1);
    expect(column(layout, 'db')).toBe(2);
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

  it("met ce qu'on GARDE à gauche et ce qu'on APPELLE à droite", () => {
    // Les deux sont des feuilles du graphe : la seule profondeur les poserait
    // sur une même ligne, où une base et une API tierce deviennent
    // interchangeables. Or une panne de tierce dégrade une fonction, une base
    // perdue arrête tout — les mélanger fait chercher au mauvais endroit.
    const layout = layoutOf([
      node('api', ['db', 'r2', 'stripe']),
      node('db', [], 'datastore'),
      node('r2', [], 'datastore'),
      node('stripe', [], 'external-api'),
    ]);

    expect(lane(layout, 'db')).toBe(-1);
    // Le stockage est un magasin d'état : il voyage AVEC les bases.
    expect(lane(layout, 'r2')).toBe(-1);
    expect(lane(layout, 'stripe')).toBe(1);
    // L'échine reste au centre : c'est le chemin d'une requête.
    expect(lane(layout, 'api')).toBe(0);
  });

  it('centre chaque groupe sur son couloir', () => {
    // Les décalages se lisent depuis le centre du groupe : deux nœuds donnent
    // -0,5 et +0,5, un seul donne 0. Sans ça, une bande d'un nœud et une bande
    // de quatre ne partageraient aucun axe, et l'échine serait tordue.
    const layout = layoutOf([node('gw', ['a', 'b']), node('a'), node('b')]);
    const band = layout.nodes.filter((placed) => placed.column === 1);

    expect(band.map((placed) => placed.offset)).toEqual([-0.5, 0.5]);
    expect(offset(layout, 'gw')).toBe(0);
  });

  it('annonce le plus grand groupe de chaque couloir', () => {
    // La toile se cadre là-dessus : un couloir vide ne doit pas réserver de
    // place, sinon l'échine cesse d'être au milieu de ce qui est dessiné.
    const layout = layoutOf([
      node('api', ['db', 'stripe', 'resend']),
      node('db', [], 'datastore'),
      node('stripe', [], 'external-api'),
      node('resend', [], 'external-api'),
    ]);

    expect(layout.lanes).toEqual({ left: 1, centre: 1, right: 2 });
  });
});

const column = (layout: MapLayout, id: string): number | undefined =>
  layout.nodes.find((placed) => placed.health.node === id)?.column;

const lane = (layout: MapLayout, id: string): number | undefined =>
  layout.nodes.find((placed) => placed.health.node === id)?.lane;

const offset = (layout: MapLayout, id: string): number | undefined =>
  layout.nodes.find((placed) => placed.health.node === id)?.offset;
