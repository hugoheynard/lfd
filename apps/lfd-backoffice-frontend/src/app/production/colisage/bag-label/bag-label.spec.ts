import { TestBed } from '@angular/core/testing';
import type { PackingBagLabelsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { BagLabel } from './bag-label';

const ORDER: PackingBagLabelsView = {
  orderId: 'o-1',
  reference: 'ORD-0042',
  customerLabel: 'Le Bistrot',
  fulfillmentLabel: 'Retrait Adroit · particulier',
  when: 'Sans heure convenue',
  color: null,
  handoverUrl: '',
  bags: [],
};

function render(of: number): HTMLElement {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(BagLabel);
  fixture.componentRef.setInput('order', ORDER);
  fixture.componentRef.setInput('bag', { containerId: 'c-1', label: 'Sac 1', rank: 1, of });
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('BagLabel', () => {
  it('imprime le numéro de commande et l’acheminement tels que servis', () => {
    const element = render(3);
    expect(element.querySelector('[data-bag-reference]')?.textContent?.trim()).toBe('ORD-0042');
    expect(element.querySelector('[data-bag-method]')?.textContent?.trim()).toBe(
      'Retrait Adroit · particulier',
    );
    expect(element.querySelector('[data-bag-rank]')?.textContent?.trim()).toBe('Sac 1/3');
  });

  it('🔴 ni QR ni carré quand le serveur n’en sert pas', () => {
    const element = render(1);
    expect(element.querySelector('svg')).toBeNull();
    expect(element.querySelector('[data-bag-color]')).toBeNull();
    expect(element.querySelector('[data-bag-rank]')).toBeNull();
  });
});
