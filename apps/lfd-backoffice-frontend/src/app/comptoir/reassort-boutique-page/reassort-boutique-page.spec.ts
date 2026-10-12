import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ReassortBoutiquePage } from './reassort-boutique-page';

describe('ReassortBoutiquePage', () => {
  it('dit que l’écran est à venir, sans rien charger', async () => {
    const fixture = TestBed.createComponent(ReassortBoutiquePage);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('fold-empty-state')?.textContent).toContain(
      'Réassort boutique — à venir',
    );
    expect(host.textContent).toContain('pas encore construit');
  });
});
