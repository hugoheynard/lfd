import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { OrderCard, type OrderCardTag } from './order-card';

function mount(inputs: {
  readonly position?: number | null;
  readonly handle?: boolean;
  readonly mark?: 'placed' | 'proposed' | 'frozen';
  readonly edge?: 'none' | 'alert' | 'warning' | 'proposed';
  readonly tags?: readonly OrderCardTag[];
}) {
  const fixture = TestBed.createComponent(OrderCard);
  fixture.componentRef.setInput('title', 'Chalet Marmotte');
  fixture.componentRef.setInput('meta', 'CMD-2043 · Val-d’Isère');
  fixture.componentRef.setInput('window', 'avant 08 h 30');
  fixture.componentRef.setInput('ariaLabel', 'Arrêt 2, Chalet Marmotte, avant 08 h 30');
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('OrderCard', () => {
  it('se lit au clavier : focalisable, avec son nom complet', () => {
    const element = mount({});
    expect(element.getAttribute('tabindex')).toBe('0');
    expect(element.getAttribute('aria-label')).toBe('Arrêt 2, Chalet Marmotte, avant 08 h 30');
    expect(element.querySelector('[data-card-window]')?.textContent).toBe('avant 08 h 30');
  });

  it('un arrêt porte son numéro ; une commande à répartir, sa poignée', () => {
    const stop = mount({ position: 2, mark: 'proposed', handle: true });
    expect(stop.querySelector('[data-position]')?.className).toContain('num-proposed');
    expect(stop.textContent).not.toContain('⋮⋮');
    expect(mount({ handle: true }).textContent).toContain('⋮⋮');
    expect(mount({}).textContent).not.toContain('⋮⋮');
  });

  it('pose le liseré et les étiquettes', () => {
    const element = mount({
      edge: 'alert',
      tags: [{ label: 'Commande annulée', variant: 'alert' }],
    });
    expect(element.querySelector('[data-order-card]')?.className).toContain('edge-alert');
    expect(element.querySelector('[data-card-tag]')?.textContent).toContain('Commande annulée');
  });
});
