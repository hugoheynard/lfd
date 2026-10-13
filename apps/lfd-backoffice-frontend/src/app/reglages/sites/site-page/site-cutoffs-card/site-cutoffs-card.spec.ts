import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { OrderCutoffView, SiteView, StaffPermission } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../../auth/permissions.store';
import type { CutoffPanelData } from '../../../../b2b/reglages/cutoffs-section/cutoff-panel/cutoff-panel';
import { OrderCutoffsService } from '../../../../b2b/reglages/order-cutoffs.service';
import { NotifyService } from '../../../../notify.service';
import { SiteCutoffsCard } from './site-cutoffs-card';

const SITE: SiteView = {
  id: 'site_1',
  label: 'Village',
  ligne1: '1 place',
  ligne2: '',
  codePostal: '73000',
  ville: 'Val',
  pays: 'France',
  isDefault: false,
  discount: null,
  discountAudiences: { b2b: true, b2c: true },
  opening: { publicOpening: null, proPickup: null },
  gps: null,
  pickup: true,
  supply: 'on_site',
  deliveryDeparture: false,
  transferMode: 'integrated',
  counterSetupMinutes: 0,
  pickupColorB2b: null,
  pickupColorB2c: null,
  deliveryColorB2b: null,
  deliveryColorB2c: null,
  archivedAt: null,
  isDeparture: false,
};

const rule = (id: string, pickupAddressId: string | null, time: string): OrderCutoffView => ({
  id,
  pickupAddressId,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time,
  graceMinutes: 0,
});

/** Le panneau, doublé : il retient ce qu'on lui a ouvert. */
class FakePanels {
  readonly opened: CutoffPanelData[] = [];

  open(_component: unknown, options: { readonly data: CutoffPanelData }) {
    this.opened.push(options.data);
    return { closed: Promise.resolve(false) };
  }
}

async function mount(
  rules: readonly OrderCutoffView[] | 'forbidden',
  permissions: readonly StaffPermission[] = ['b2b_settings:read', 'b2b_settings:write'],
): Promise<{ fixture: ComponentFixture<SiteCutoffsCard>; panels: FakePanels }> {
  const panels = new FakePanels();
  const list = (): Promise<readonly OrderCutoffView[]> =>
    rules === 'forbidden'
      ? Promise.reject(new HttpErrorResponse({ status: 403 }))
      : Promise.resolve(rules);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SiteCutoffsCard],
    providers: [
      provideRouter([]),
      { provide: OrderCutoffsService, useValue: { list } },
      { provide: FoldPanelHostService, useValue: panels },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(SiteCutoffsCard);
  fixture.componentRef.setInput('site', SITE);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, panels };
}

describe('SiteCutoffsCard — les heures limites de CE site (Hugo, 2026-10-13)', () => {
  it('ne montre que les règles du site, et la règle par défaut en lecture', async () => {
    const { fixture } = await mount([
      rule('own', 'site_1', '17:00'),
      rule('other', 'site_2', '09:00'),
      rule('default', null, '18:00'),
    ]);
    const text: string = fixture.nativeElement.textContent;

    expect(fixture.nativeElement.querySelectorAll('.sc-rule')).toHaveLength(1);
    expect(text).toContain('17:00');
    expect(text).not.toContain('09:00');
    expect(text).toContain('Sinon, règle par défaut');
  });

  it('ouvre le panneau verrouillé sur ce site', async () => {
    const { fixture, panels } = await mount([]);
    fixture.componentInstance['add']();

    expect(panels.opened[0]?.lockedPointId).toBe('site_1');
  });

  it('sans `b2b_settings:write`, montre sans aucun geste', async () => {
    const { fixture } = await mount([rule('own', 'site_1', '17:00')], ['b2b_settings:read']);

    expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(0);
  });

  it('sans le droit de lecture, le dit au lieu de se taire', async () => {
    const { fixture } = await mount('forbidden');

    expect(fixture.nativeElement.textContent).toContain('droit des réglages B2B');
  });
});
