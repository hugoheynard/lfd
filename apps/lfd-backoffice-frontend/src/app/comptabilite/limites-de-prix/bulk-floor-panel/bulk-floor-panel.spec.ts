import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import type { SetPriceFloorPayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PriceLimitsService } from '../../price-limits.service';
import { BulkFloorPanel, type BulkFloorPanelData } from './bulk-floor-panel';

/**
 * **La pose groupée** : un appel par article, et un bilan qui dit lesquels ont
 * été refusés et pourquoi — un échec n'arrête pas les autres.
 */

const DATA: BulkFloorPanelData = {
  clientele: 'public',
  articles: [
    { sku: 'VIE-001', name: 'Croissant', hasOwn: false },
    { sku: 'VIE-002', name: 'Pain au chocolat', hasOwn: true },
    { sku: 'VIE-003', name: 'Chausson', hasOwn: false },
  ],
};

function mount(sent: SetPriceFloorPayload[], closed: unknown[]): ComponentFixture<BulkFloorPanel> {
  const service: Pick<PriceLimitsService, 'setFloor'> = {
    setFloor: (payload) => {
      sent.push(payload);
      return payload.scope.id === 'VIE-002'
        ? Promise.reject(
            new HttpErrorResponse({
              status: 409,
              error: { message: 'La porte doit rester sous le mur.' },
            }),
          )
        : Promise.resolve();
    },
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PriceLimitsService, useValue: service },
      { provide: FoldPanelRef, useValue: { close: (value: unknown) => closed.push(value) } },
    ],
  });
  const fixture = TestBed.createComponent(BulkFloorPanel);
  fixture.componentRef.setInput('data', DATA);
  fixture.detectChanges();
  return fixture;
}

describe('BulkFloorPanel', () => {
  it('prévient qu’une limite propre sera remplacée', () => {
    const fixture = mount([], []);

    expect(String(fixture.nativeElement.textContent)).toContain('sera');
    expect(fixture.componentInstance['replaced']()).toBe(1);
  });

  it('pose article par article, pour la clientèle, et rend le bilan d’un échec partiel', async () => {
    const sent: SetPriceFloorPayload[] = [];
    const closed: unknown[] = [];
    const fixture = mount(sent, closed);
    const panel = fixture.componentInstance;

    panel['draft'].set({ mode: 'percent', value: 5000, dynamic: null });
    await panel['submit']();
    fixture.detectChanges();

    expect(sent.map((payload) => payload.scope.id)).toEqual(['VIE-001', 'VIE-002', 'VIE-003']);
    expect(sent.every((payload) => payload.clientele === 'public')).toBe(true);
    const text = String(fixture.nativeElement.textContent);
    expect(text).toContain('2 posée(s), 1 refusée(s)');
    expect(text).toContain('Pain au chocolat');
    expect(text).toContain('La porte doit rester sous le mur.');

    panel['close']();
    expect(closed).toEqual([true]);
  });
});
