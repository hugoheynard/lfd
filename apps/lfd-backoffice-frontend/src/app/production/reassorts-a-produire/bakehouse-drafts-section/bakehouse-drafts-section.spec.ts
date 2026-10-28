import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { BakehouseResupplyDraftView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import { BakehouseResuppliesService } from '../bakehouse-resupplies.service';
import { BakehouseDraftsSection } from './bakehouse-drafts-section';

/** Les brouillons ouverts, sur la liste des réassorts (Hugo, 2026-10-28). */
describe('BakehouseDraftsSection', () => {
  const DRAFT: BakehouseResupplyDraftView = {
    id: 'dr_1',
    version: 2,
    siteId: 'site_v',
    target: 'asap',
    name: null,
    lines: [{ sku: 'CRO', quantity: 4 }],
    savedByName: 'Hugo',
    savedAt: '2026-10-28T10:00:00.000Z',
  };

  async function mount(stored: BakehouseResupplyDraftView[]) {
    const discarded: string[] = [];
    const navigations: unknown[] = [];
    TestBed.configureTestingModule({
      imports: [BakehouseDraftsSection],
      providers: [
        provideRouter([]),
        {
          provide: BakehouseResuppliesService,
          useValue: {
            drafts: () => Promise.resolve(stored),
            discardDraft: (id: string, version: number) => {
              discarded.push(`${id}:v${String(version)}`);
              stored.splice(0, stored.length);
              return Promise.resolve();
            },
          },
        },
        {
          provide: PickupAddressesService,
          useValue: { list: () => Promise.resolve([{ id: 'site_v', label: 'Village' }]) },
        },
      ],
    });
    const router = TestBed.inject(Router);
    router.navigate = (commands: readonly unknown[]) => {
      navigations.push(commands);
      return Promise.resolve(true);
    };
    const fixture = TestBed.createComponent(BakehouseDraftsSection);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement, discarded, navigations };
  }

  it('sans brouillon, ne montre rien', async () => {
    const { root } = await mount([]);

    expect(root.querySelector('[data-bakehouse-draft]')).toBeNull();
  });

  it('« Reprendre » ouvre la page du brouillon', async () => {
    const { root, navigations } = await mount([DRAFT]);

    root.querySelector<HTMLButtonElement>('[data-bakehouse-draft-resume]')?.click();

    expect(root.textContent).toContain('Village');
    expect(navigations).toEqual([['/prod-manager/reassorts/brouillon', 'dr_1']]);
  });
});
