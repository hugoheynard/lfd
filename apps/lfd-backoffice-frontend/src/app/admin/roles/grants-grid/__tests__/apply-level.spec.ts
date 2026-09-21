import { staffResourceSchema, type RoleGrant } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { applyLevel, levelOf } from '../apply-level';

const GRANTS: readonly RoleGrant[] = [
  { resource: 'b2b_companies', action: 'read' },
  { resource: 'b2b_orders', action: 'write' },
];

describe('applyLevel', () => {
  it('pose un niveau sur une ressource neuve', () => {
    expect(applyLevel(GRANTS, 'pim_catalog', 'read')).toContainEqual({
      resource: 'pim_catalog',
      action: 'read',
    });
  });

  it('remplace le niveau au lieu d’en ajouter un second', () => {
    const next = applyLevel(GRANTS, 'b2b_orders', 'read');
    expect(next.filter((grant) => grant.resource === 'b2b_orders')).toEqual([
      { resource: 'b2b_orders', action: 'read' },
    ]);
  });

  it('retire la ligne sur « aucun accès » — l’absence de droit est une absence', () => {
    // Écrire une ligne à zéro ferait deux écritures pour la même chose.
    expect(applyLevel(GRANTS, 'b2b_orders', 'none').map((grant) => grant.resource)).toEqual([
      'b2b_companies',
    ]);
  });

  it('reste sans effet quand on retire ce qui n’était pas accordé', () => {
    expect(applyLevel(GRANTS, 'pim_tax', 'none')).toEqual(GRANTS);
  });

  it('range toujours dans l’ordre du catalogue, jamais celui de la saisie', () => {
    // Deux rôles aux mêmes droits doivent produire la MÊME ligne en base :
    // sinon un diff de journal montre un changement là où rien n'a bougé.
    const bySaisie = applyLevel(applyLevel([], 'ops_health', 'read'), 'b2b_companies', 'read');
    const byOrdre = applyLevel(applyLevel([], 'b2b_companies', 'read'), 'ops_health', 'read');
    expect(bySaisie).toEqual(byOrdre);

    const positions = bySaisie.map((grant) => staffResourceSchema.options.indexOf(grant.resource));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('ne mute pas la liste qu’on lui donne', () => {
    const source: readonly RoleGrant[] = [...GRANTS];
    applyLevel(source, 'b2b_orders', 'none');
    expect(source).toEqual(GRANTS);
  });
});

describe('levelOf', () => {
  it('rend le niveau posé', () => {
    expect(levelOf(GRANTS, 'b2b_orders')).toBe('write');
  });

  it('rend « aucun » pour une ressource absente', () => {
    expect(levelOf(GRANTS, 'staff_access')).toBe('none');
  });
});
