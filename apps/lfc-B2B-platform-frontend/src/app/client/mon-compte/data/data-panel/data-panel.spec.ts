import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';

import { FR } from '../../../copy/fr';
import { openShopAt } from '../../../feature-access/feature-access.fixture';
import { DataPanel } from './data-panel';

describe('DataPanel', () => {
  /** En pile, le panneau porte les mêmes quatre boutons que la carte bureau — sans action d'origine. */
  it('porte les exports, la conservation et les deux gestes sensibles', () => {
    TestBed.configureTestingModule({
      imports: [DataPanel],
      providers: [{ provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) }],
    });
    openShopAt('order');
    const fixture = TestBed.createComponent(DataPanel);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const labels = Array.from(el.querySelectorAll('fold-panel-body button')).map(
      (b) => b.textContent?.trim() ?? '',
    );
    expect(labels).toEqual([
      FR.account.dataExportOrders,
      FR.account.dataExportPersonal,
      FR.account.transferCta,
      FR.account.closeCta,
    ]);
    expect(el.textContent).toContain(FR.account.dataKeep);
    expect(el.querySelector('fold-callout')?.textContent).toContain(FR.account.closeBody);
  });
});
