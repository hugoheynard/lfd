import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { ClientOrderHistory } from '../client-order-history.service';
import { RetraitPanel } from './retrait-panel';

describe('RetraitPanel', () => {
  /** Hugo, 2026-10-27 : en pile, le QR s'ouvre en panneau, sur la commande donnée. */
  it('lit la commande qu’on lui donne et en montre le code', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RetraitPanel],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: FoldPanelRef, useValue: { close: () => undefined } },
      ],
    });
    const byId = vi.spyOn(TestBed.inject(ClientOrderHistory), 'byId').mockResolvedValue(null);
    const fixture = TestBed.createComponent(RetraitPanel);
    fixture.componentRef.setInput('data', 'ord_9');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId).toHaveBeenCalledWith('ord_9');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('introuvable');
  });
});
