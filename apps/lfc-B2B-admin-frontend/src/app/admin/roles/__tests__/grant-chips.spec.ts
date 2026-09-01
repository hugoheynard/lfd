import type { RoleGrant } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { grantGroups, RESOURCE_COUNT } from '../grant-chips';

describe('grantGroups', () => {
  it("met l'écriture en premier — c'est ce qu'on cherche en auditant un rôle", () => {
    const groups = grantGroups([
      { resource: 'pim_catalog', action: 'read' },
      { resource: 'b2b_orders', action: 'write' },
    ]);
    expect(groups.map((group) => group.level)).toEqual(['write', 'read']);
  });

  it('ne montre que ce qui est ouvert', () => {
    // Sept lignes vides sur douze obligeaient le regard à trier.
    expect(grantGroups([{ resource: 'b2b_orders', action: 'write' }])).toEqual([
      { level: 'write', label: 'Écriture', resources: ['Commandes'] },
    ]);
  });

  it("range chaque groupe dans l'ordre du catalogue, pas dans celui de la saisie", () => {
    // C'est ce qui permet de comparer deux cartes côte à côte sans les lire.
    const grants: readonly RoleGrant[] = [
      { resource: 'ops_health', action: 'read' },
      { resource: 'b2b_companies', action: 'read' },
    ];
    expect(grantGroups(grants)[0]?.resources).toEqual(['Comptes clients', "Santé de l'écosystème"]);
  });

  it('omet un niveau que le rôle n’accorde nulle part', () => {
    expect(grantGroups([{ resource: 'b2b_orders', action: 'read' }]).map((g) => g.level)).toEqual([
      'read',
    ]);
  });

  it('rend une liste vide pour un rôle sans droit', () => {
    expect(grantGroups([])).toEqual([]);
  });

  it('compte les domaines du catalogue', () => {
    expect(RESOURCE_COUNT).toBe(19);
  });
});
