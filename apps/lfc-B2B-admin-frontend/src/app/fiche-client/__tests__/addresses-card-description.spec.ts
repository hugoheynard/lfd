import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CompanyAddressesCard } from '@lfd/b2b-ui/company';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Ce que la section **Adresses** annonce d'elle-même.
 *
 * La phrase était écrite en dur et promettait « une ou plusieurs adresses de
 * livraison » y compris quand le bloc livraison n'est pas rendu — sur l'écran
 * même où le commercial cherche ce qui manque au compte.
 */
@Component({
  imports: [CompanyAddressesCard],
  template: `<lfd-company-addresses-card
    [deliveries]="[]"
    [showDeliveries]="showDeliveries()"
    [showPickup]="showPickup()"
  />`,
})
class Host {
  readonly showDeliveries = input(true);
  readonly showPickup = input(false);
}

function render(inputs: { showDeliveries: boolean; showPickup: boolean }): string {
  const fixture = TestBed.createComponent(Host);
  fixture.componentRef.setInput('showDeliveries', inputs.showDeliveries);
  fixture.componentRef.setInput('showPickup', inputs.showPickup);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('carte adresses — ce que la section annonce', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('annonce la livraison quand le bloc livraison est rendu', () => {
    expect(render({ showDeliveries: true, showPickup: false })).toContain('adresses de livraison');
  });

  it('ne promet PAS de livraison quand le service n’existe pas', () => {
    const text = render({ showDeliveries: false, showPickup: true });

    expect(text).not.toContain('adresses de livraison');
    expect(text).toContain('retire ses commandes');
  });

  it('n’annonce que la facturation quand il n’y a ni livraison ni retrait', () => {
    const text = render({ showDeliveries: false, showPickup: false });

    expect(text).not.toContain('livraison');
    expect(text).not.toContain('retire ses commandes');
  });
});
