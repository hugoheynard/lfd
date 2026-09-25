import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { PaymentLinksService } from '../payment-links.service';
import { LiensDePaiementPage } from './liens-de-paiement-page';

/** L'onglet choisit ce qui est chargé : un seul sujet à l'écran à la fois. */
describe('LiensDePaiementPage', () => {
  it('ouvre sur les commandes à régler, et bascule sur les liens libres', async () => {
    TestBed.configureTestingModule({
      imports: [LiensDePaiementPage],
      providers: [
        {
          provide: PaymentLinksService,
          useValue: {
            listOrders: () => Promise.resolve([]),
            listLinks: () => Promise.resolve([]),
            readSettings: () => Promise.resolve({ paymentLinkMaxCents: null }),
          },
        },
        { provide: PermissionsStore, useValue: { can: (): boolean => true } },
        { provide: NotifyService, useValue: { success: () => undefined } },
        { provide: FoldPanelHostService, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(LiensDePaiementPage);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-orders-to-settle'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('app-free-links'))).toBeNull();

    fixture.debugElement.query(By.css('fold-tabs')).triggerEventHandler('activeKeyChange', 'free');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-free-links'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('app-orders-to-settle'))).toBeNull();
  });
});
