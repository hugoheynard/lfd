import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { DetailRow } from '../detail-rows';
import { FactDetail } from './fact-detail';

/**
 * **Le détail d'un fait, à l'écran** : replié par défaut, ouvert par un bouton
 * (donc au clavier), et absent quand il n'y a rien à ajouter.
 */
function mount(rows: readonly DetailRow[]) {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(FactDetail);
  fixture.componentRef.setInput('rows', rows);
  fixture.detectChanges();
  return fixture;
}

describe('FactDetail', () => {
  it('est replié par défaut, et s’ouvre par son bouton', async () => {
    const fixture = mount([
      { label: 'Prix HT', value: '8,18 €' },
      { label: 'Motif', value: 'Remise de fin de série' },
    ]);
    const host: HTMLElement = fixture.nativeElement;
    const toggle = host.querySelector('button');

    expect(toggle?.textContent).toContain('Détail (2)');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');

    toggle?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(host.textContent).toContain('Prix HT');
    expect(host.textContent).toContain('Remise de fin de série');
  });

  it('ne rend rien quand la phrase a tout dit', () => {
    const fixture = mount([]);

    expect(fixture.nativeElement.querySelector('fold-disclosure')).toBeNull();
  });
});
