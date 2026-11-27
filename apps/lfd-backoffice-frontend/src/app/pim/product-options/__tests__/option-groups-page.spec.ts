import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { OptionGroupView } from '@lfd/pim-contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { OptionGroupStore } from '../option-group.store';
import { OptionGroupsPage } from '../option-groups-page/option-groups-page';

const ARCHIVED: OptionGroupView = {
  id: 'og-2',
  name: 'Ancien',
  archived: true,
  choices: [{ key: 'tranche', label: 'Tranché', audience: 'both', archived: false }],
  products: 0,
};

describe('OptionGroupsPage', () => {
  it('liste les archivés et restaure ; un refus est dit, la page se libère', async () => {
    const refused: string[] = [];
    const restored: string[] = [];
    let fail = false;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: OptionGroupStore,
          useValue: {
            items: signal([]),
            archivedItems: signal([ARCHIVED]),
            loadError: signal(null),
            restore: (id: string) => {
              restored.push(id);
              return fail ? Promise.reject(new Error('refus')) : Promise.resolve();
            },
          },
        },
        { provide: PermissionsStore, useValue: { can: () => true } },
        { provide: FoldPanelHostService, useValue: { open: () => undefined } },
        {
          provide: NotifyService,
          useValue: { refused: (_e: unknown, fallback: string) => refused.push(fallback) },
        },
      ],
    });
    const fixture = TestBed.createComponent(OptionGroupsPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page['archived']()).toEqual([{ key: 'og-2', label: 'Ancien', detail: 'Tranché' }]);
    await page['restore']('og-2');
    fail = true;
    await page['restore']('og-2');
    expect(restored).toEqual(['og-2', 'og-2']);
    expect(refused).toEqual(['Restauration refusée.']);
    expect(page['busy']()).toBe(false);
  });
});
