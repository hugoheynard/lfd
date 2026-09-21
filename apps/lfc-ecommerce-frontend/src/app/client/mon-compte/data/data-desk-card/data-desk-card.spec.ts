import { FR } from '../../../copy/fr';
import { openShopAt } from '../../../feature-access/feature-access.fixture';
import { bootCard, TOMMEUSES } from '../../account.fixture';
import { DataDeskCard } from './data-desk-card';

describe('DataDeskCard', () => {
  const labels = (el: HTMLElement): string[] =>
    Array.from(el.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');

  /**
   * Rétablis le 2026-09-14 : les deux exports et les deux gestes sensibles
   * avaient disparu du bureau. Ils n'ont AUCUNE action, comme à l'origine.
   */
  it('garde les deux exports, la conservation et les deux gestes sensibles', () => {
    const fixture = bootCard(DataDeskCard, [TOMMEUSES]);
    openShopAt('order');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(labels(el)).toEqual([
      FR.account.dataExportOrders,
      FR.account.dataExportPersonal,
      FR.account.transferCta,
      FR.account.closeCta,
    ]);
    expect(el.textContent).toContain(FR.account.dataKeep);
    expect(el.querySelector('fold-callout')?.textContent).toContain(FR.account.closeBody);
  });

  it('sous `order`, retire l’export des commandes et garde l’export personnel', () => {
    const fixture = bootCard(DataDeskCard, [TOMMEUSES]);
    openShopAt('browse');
    fixture.detectChanges();

    expect(labels(fixture.nativeElement as HTMLElement)).not.toContain(FR.account.dataExportOrders);
    expect(labels(fixture.nativeElement as HTMLElement)).toContain(FR.account.dataExportPersonal);
  });
});
