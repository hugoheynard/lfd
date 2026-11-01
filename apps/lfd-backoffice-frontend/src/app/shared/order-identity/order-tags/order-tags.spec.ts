import { TestBed } from '@angular/core/testing';
import type { OrderClientele } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import type { LogisticsCategory } from '../../logistics-colors/logistics-category';
import { OrderTags } from './order-tags';

const ADROIT: LogisticsCategory = {
  key: 'pickup:adroit:pro',
  label: 'Retrait Adroit',
  color: '#000080',
};

function render(clientele: OrderClientele | null, mode: LogisticsCategory = ADROIT): HTMLElement {
  const fixture = TestBed.createComponent(OrderTags);
  fixture.componentRef.setInput('clientele', clientele);
  fixture.componentRef.setInput('mode', mode);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('OrderTags — clientèle et mode d’une commande', () => {
  it('un pro porte le badge « Pro » et le mode coloré', () => {
    const element = render('pro');
    expect(element.querySelector('[data-clientele]')?.textContent).toContain('Pro');
    const mode = element.querySelector<HTMLElement>('[data-mode] .ls-swatch');
    expect(mode?.textContent?.trim()).toBe('Retrait Adroit');
    expect(mode?.style.backgroundColor).toBe('rgb(0, 0, 128)');
  });

  it('un particulier porte « Particulier »', () => {
    expect(render('public').querySelector('[data-clientele]')?.textContent).toContain(
      'Particulier',
    );
  });

  it('🔴 clientèle inconnue : aucun badge, le mode reste', () => {
    const element = render(null, { key: 'delivery', label: 'Livraison', color: null });
    expect(element.querySelector('[data-clientele]')).toBeNull();
    expect(element.querySelector('[data-mode]')?.textContent?.trim()).toBe('Livraison');
  });
});
