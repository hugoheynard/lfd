import { describe, expect, it } from 'vitest';

import type { CatalogRightTransferView } from '@lfd/contracts';

import { pendingCount, transferLines } from '../transfer-lines';

const VIEW: CatalogRightTransferView = {
  roles: [
    {
      key: 'commercial',
      label: 'Commercial',
      archived: false,
      legacyLevel: 'write',
      catalogLevel: null,
      gap: 'catalog_missing',
    },
    {
      key: 'vitrine',
      label: 'Vitrine',
      archived: true,
      legacyLevel: null,
      catalogLevel: 'read',
      gap: 'none',
    },
  ],
  overrides: [
    {
      staffUserId: 'fiche-lea',
      staffName: 'Léa Martin',
      action: 'write',
      legacyEffect: 'deny',
      catalogEffect: null,
      gap: 'revoke_not_copied',
    },
  ],
  unreadLegacyNotifications: 0,
  clear: false,
};

describe('transferLines', () => {
  it('peint les rôles puis les dérogations, avec ce qu’ils tiennent', () => {
    expect(transferLines(VIEW).map((line) => [line.who, line.held])).toEqual([
      ['Rôle Commercial', 'vendu : écriture · publié : —'],
      ['Rôle Vitrine (archivé)', 'vendu : — · publié : lecture'],
      ['Léa Martin — dérogation en écriture', 'vendu : retiré · publié : —'],
    ]);
  });

  it('dit qu’un retrait non recopié DONNERAIT l’accès', () => {
    expect(transferLines(VIEW)[2]?.todo).toContain('GAGNÉ');
  });

  it('ne compte à traiter que les lignes qui ne sont pas faites', () => {
    expect(pendingCount(VIEW)).toBe(2);
  });
});
