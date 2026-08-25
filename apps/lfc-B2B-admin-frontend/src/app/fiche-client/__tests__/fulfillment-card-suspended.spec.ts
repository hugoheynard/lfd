import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CompanyFulfillmentCard } from '@lfd/b2b-ui/company';
import type { FulfillmentPreferenceView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Ce que devient une préférence de **livraison** quand la livraison ferme.
 *
 * Le réglage survit — on ne l'efface pas dans le dos du client, il le
 * retrouvera à l'ouverture. Mais le bouton « Livraison » disparaît avec le
 * service, et la méthode retenue n'était alors écrite nulle part : l'écran
 * n'offrait plus qu'un « Retirer la préférence » sans dire de quoi on sortait,
 * ni que le réglage était devenu inerte.
 *
 * Aucun container ne peut produire ce cas aujourd'hui — `DELIVERY_SERVICE_OPEN`
 * est une constante, et elle est à vrai. C'est précisément pourquoi la carte se
 * teste ici directement : ce chemin ne se voit qu'au moment où le drapeau
 * rebascule, c'est-à-dire trop tard.
 */
@Component({
  imports: [CompanyFulfillmentCard],
  template: `<lfd-company-fulfillment-card
    [preference]="preference()"
    [deliveryOffered]="deliveryOffered()"
  />`,
})
class Host {
  readonly preference = input.required<FulfillmentPreferenceView>();
  readonly deliveryOffered = input(true);
}

const DELIVERY: FulfillmentPreferenceView = {
  method: 'delivery',
  pickupAddressId: null,
  deliveryAddressId: null,
  signatureRequired: false,
};

function render(deliveryOffered: boolean): HTMLElement {
  const fixture = TestBed.createComponent(Host);
  fixture.componentRef.setInput('preference', DELIVERY);
  fixture.componentRef.setInput('deliveryOffered', deliveryOffered);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('carte acheminement — la livraison fermée', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('ÉCRIT la méthode retenue même sans son bouton', () => {
    const text = render(false).textContent ?? '';

    expect(text).toContain('Méthode habituelle');
    expect(text).toContain('Livraison');
  });

  it('dit que la préférence ne s’applique plus, et qu’elle est conservée', () => {
    const text = render(false).textContent ?? '';

    expect(text).toContain("La livraison n'est pas en service");
    expect(text).toContain('reste enregistrée');
  });

  it('laisse toujours de quoi en SORTIR', () => {
    // Sans issue, un client servi en retrait resterait sur un réglage inerte.
    const labels = [...render(false).querySelectorAll('button')].map((b) =>
      (b.textContent ?? '').trim(),
    );

    expect(labels).toContain('Retrait');
    expect(labels).toContain('Retirer la préférence');
    // Le bouton absent est celui du service fermé — promettre le geste serait
    // promettre le service.
    expect(labels).not.toContain('Livraison');
  });

  it('ne dit rien de tel quand la livraison est en service', () => {
    const text = render(true).textContent ?? '';

    expect(text).not.toContain("La livraison n'est pas en service");
  });
});
