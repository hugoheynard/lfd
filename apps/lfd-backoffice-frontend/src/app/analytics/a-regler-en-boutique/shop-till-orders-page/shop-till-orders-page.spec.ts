import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ShopTillOrdersReportView } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { ShopTillOrdersService } from '../shop-till-orders.service';
import { ShopTillOrdersPage } from './shop-till-orders-page';

const REPORT: ShopTillOrdersReportView = {
  from: '2026-11-01',
  to: '2026-11-20',
  rows: [
    {
      day: '2026-11-20',
      siteId: 's1',
      pickupLabel: 'Boutique',
      orderedTtcCents: 3000,
      orderedCount: 3,
      handedOverTtcCents: 2000,
      handedOverCount: 2,
      notCollectedTtcCents: 1000,
      notCollectedCount: 1,
    },
  ],
};

async function mount(
  report: ReturnType<typeof vi.fn>,
): Promise<ComponentFixture<ShopTillOrdersPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ShopTillOrdersService, useValue: { report } }],
  });
  const fixture = TestBed.createComponent(ShopTillOrdersPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (f: ComponentFixture<ShopTillOrdersPage>) =>
  ((f.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/gu, ' ');

describe('ShopTillOrdersPage — à régler en boutique', () => {
  it('montre commandé, remis et non retirées, jamais « encaissé »', async () => {
    const fixture = await mount(vi.fn(() => Promise.resolve(REPORT)));
    expect(text(fixture)).toContain('Commandé TTC');
    expect(text(fixture)).toContain('Remis TTC');
    expect(text(fixture)).toContain('Non retirées TTC');
    expect(text(fixture)).toContain('Boutique');
    expect(text(fixture).toLowerCase()).not.toContain('encaissé ttc');
  });

  it('dit tel quel le refus de la période', async () => {
    const refusal = new HttpErrorResponse({
      status: 400,
      error: { code: 'growth.period', message: 'Au plus 366 jours.' },
    });
    const fixture = await mount(vi.fn(() => Promise.reject(refusal)));
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-period-refusal]')?.textContent,
    ).toContain('Au plus 366 jours.');
  });
});
