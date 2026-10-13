import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { LogisticsCategory } from '../logistics-category';
import { LogisticsSwatch } from './logistics-swatch';

function render(category: LogisticsCategory): HTMLElement {
  const fixture = TestBed.createComponent(LogisticsSwatch);
  fixture.componentRef.setInput('category', category);
  fixture.detectChanges();
  const swatch = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.ls-swatch');
  if (swatch === null) {
    throw new Error('La pastille devait être rendue.');
  }
  return swatch;
}

describe('LogisticsSwatch', () => {
  it('peint la couleur du site et dit la catégorie', () => {
    const swatch = render({ key: 'delivery:pro', label: 'Livraison pro', color: '#1e88e5' });

    expect(swatch.textContent?.trim()).toBe('Livraison pro');
    expect(swatch.style.backgroundColor).toBe('rgb(30, 136, 229)');
    expect(swatch.dataset['category']).toBe('delivery:pro');
  });

  it('choisit l’encre par contraste : sombre sur un jaune, claire sur un bleu nuit', () => {
    expect(render({ key: 'a', label: 'A', color: '#fdd835' }).classList.contains('on-light')).toBe(
      true,
    );
    expect(render({ key: 'b', label: 'B', color: '#000080' }).classList.contains('on-dark')).toBe(
      true,
    );
  });

  it('sans couleur : la teinte neutre, aucun fond posé', () => {
    const swatch = render({ key: 'pickup', label: 'Retrait', color: null });

    expect(swatch.classList.contains('is-neutral')).toBe(true);
    expect(swatch.style.backgroundColor).toBe('');
  });
});
