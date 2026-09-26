import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { LoyaltyService } from '../loyalty.service';
import { FidelitePage } from './fidelite-page';

/** L'onglet choisit ce qui est chargé : un seul sujet à l'écran à la fois. */
describe('FidelitePage', () => {
  it('ouvre sur le réglage, puis bascule sur les soldes et les bons', async () => {
    TestBed.configureTestingModule({
      imports: [FidelitePage],
      providers: [
        {
          provide: LoyaltyService,
          useValue: {
            readSettings: () => Promise.resolve({ settings: null }),
            listBalances: () => Promise.resolve([]),
            listVouchers: () => Promise.resolve([]),
          },
        },
        { provide: PermissionsStore, useValue: { can: (): boolean => true } },
        { provide: NotifyService, useValue: { success: () => undefined } },
        { provide: FoldPanelHostService, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(FidelitePage);
    await fixture.whenStable();
    fixture.detectChanges();

    const shown = (selector: string): boolean =>
      fixture.debugElement.query(By.css(selector)) !== null;

    expect(shown('app-loyalty-settings')).toBe(true);
    expect(shown('app-loyalty-balances')).toBe(false);

    const tabs = fixture.debugElement.query(By.css('fold-tabs'));
    tabs.triggerEventHandler('activeKeyChange', 'balances');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(shown('app-loyalty-balances')).toBe(true);
    expect(shown('app-loyalty-settings')).toBe(false);

    tabs.triggerEventHandler('activeKeyChange', 'vouchers');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(shown('app-loyalty-vouchers')).toBe(true);
  });
});
