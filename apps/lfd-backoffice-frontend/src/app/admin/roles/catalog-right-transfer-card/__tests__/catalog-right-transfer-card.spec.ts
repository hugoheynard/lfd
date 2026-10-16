import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { CatalogRightTransferView } from '@lfd/contracts';

import { StaffRolesService } from '../../staff-roles.service';
import { CatalogRightTransferCard } from '../catalog-right-transfer-card';

/** Le service réduit à la seule lecture que la carte fait. */
class FakeRoles {
  constructor(private readonly answer: CatalogRightTransferView | Error) {}

  catalogRightTransfer(): Promise<CatalogRightTransferView> {
    return this.answer instanceof Error
      ? Promise.reject(this.answer)
      : Promise.resolve(this.answer);
  }
}

async function render(answer: CatalogRightTransferView | Error): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    imports: [CatalogRightTransferCard],
    providers: [{ provide: StaffRolesService, useValue: new FakeRoles(answer) }],
  });
  const fixture = TestBed.createComponent(CatalogRightTransferCard);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('CatalogRightTransferCard', () => {
  it('annonce « Sans écart » quand le transfert est fini', async () => {
    const host = await render({
      roles: [],
      overrides: [],
      unreadLegacyNotifications: 0,
      clear: true,
    });
    expect(host.textContent).toContain('Sans écart');
  });

  it('compte ce qui reste et les notifications qu’on perdra', async () => {
    const host = await render({
      roles: [
        {
          key: 'commercial',
          label: 'Commercial',
          archived: false,
          legacyLevel: 'write',
          catalogLevel: 'write',
          gap: 'legacy_still_held',
        },
      ],
      overrides: [],
      unreadLegacyNotifications: 3,
      clear: false,
    });
    expect(host.textContent).toContain('1 à traiter');
    expect(host.textContent).toContain('Rôle Commercial');
    expect(host.textContent).toContain('3 notification(s)');
  });

  it('dit l’échec du chargement au lieu de se taire', async () => {
    const host = await render(new Error('500'));
    expect(host.textContent).toContain('n’a pas pu être chargé');
  });
});
