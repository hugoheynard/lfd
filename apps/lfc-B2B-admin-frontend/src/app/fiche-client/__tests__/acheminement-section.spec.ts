import { TestBed } from '@angular/core/testing';
import type {
  DeliveryAddressView,
  FulfillmentPreferenceView,
  PickupAddressView,
} from '@lfd/contracts';
import { NO_FULFILLMENT_PREFERENCE } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { AcheminementSection } from '../acheminement-section/acheminement-section';

const PICKUPS: readonly PickupAddressView[] = [
  {
    id: 'pick_1',
    label: 'Labo Bastille',
    ligne1: '',
    ligne2: '',
    codePostal: '',
    ville: '',
    pays: '',
    isDefault: true,
    discount: null,
  },
  {
    id: 'pick_2',
    label: 'Labo Nation',
    ligne1: '',
    ligne2: '',
    codePostal: '',
    ville: '',
    pays: '',
    isDefault: false,
    discount: null,
  },
];

const DELIVERIES = [
  { id: 'addr_1', label: 'Boutique', isDefault: true },
  { id: 'addr_2', label: 'Entrepôt', isDefault: false },
] as unknown as readonly DeliveryAddressView[];

interface Rendered {
  readonly host: HTMLElement;
  readonly emitted: FulfillmentPreferenceView[];
  readonly section: AcheminementSection;
}

function render(options: {
  readonly preference?: FulfillmentPreferenceView;
  readonly deliveries?: readonly DeliveryAddressView[];
  readonly deliveryOffered?: boolean;
}): Rendered {
  const fixture = TestBed.createComponent(AcheminementSection);
  fixture.componentRef.setInput('preference', options.preference ?? NO_FULFILLMENT_PREFERENCE);
  fixture.componentRef.setInput('pickups', PICKUPS);
  fixture.componentRef.setInput('deliveries', options.deliveries ?? DELIVERIES);
  fixture.componentRef.setInput('deliveryOffered', options.deliveryOffered ?? true);
  const emitted: FulfillmentPreferenceView[] = [];
  fixture.componentInstance.preferenceChange.subscribe((value) => emitted.push(value));
  fixture.detectChanges();
  return {
    host: fixture.nativeElement as HTMLElement,
    emitted,
    section: fixture.componentInstance,
  };
}

describe("section Préférences d'acheminement", () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it("dit qu'AUCUNE préférence n'est posée, sans faire croire au retrait", () => {
    // « Pas encore réglé » n'est pas « retrait » : c'est l'état de tout le
    // portefeuille repris.
    const { host } = render({});

    expect(host.textContent).toContain('Aucune préférence');
    expect(host.querySelector('select')).toBeNull();
  });

  it('propose de choisir un point de retrait une fois la méthode posée', () => {
    const { host } = render({
      preference: { method: 'pickup', pickupAddressId: null, deliveryAddressId: null },
    });

    const labels = [...host.querySelectorAll('option')].map((o) => o.textContent?.trim());
    expect(labels).toEqual(['Celle par défaut', 'Labo Bastille (défaut)', 'Labo Nation']);
  });

  it('offre « celle par défaut » plutôt que de figer le défaut du jour', () => {
    // Désigner nommément le point par défaut d'aujourd'hui ferait pointer la
    // préférence sur l'ancien le jour où il change.
    const { section } = render({
      preference: { method: 'pickup', pickupAddressId: null, deliveryAddressId: null },
    });

    expect(section['destinationId']()).toBe('');
  });

  it('bascule vers les adresses de la SOCIÉTÉ en livraison', () => {
    const { host } = render({
      preference: { method: 'delivery', pickupAddressId: null, deliveryAddressId: 'addr_2' },
    });

    const labels = [...host.querySelectorAll('option')].map((o) => o.textContent?.trim());
    expect(labels).toEqual(['Celle par défaut', 'Boutique (défaut)', 'Entrepôt']);
  });

  it('repart du défaut quand la méthode change', () => {
    // La destination de l'ancienne méthode n'a aucun sens dans la nouvelle.
    const { section, emitted } = render({
      preference: { method: 'delivery', pickupAddressId: null, deliveryAddressId: 'addr_2' },
    });

    section['chooseMethod']('pickup');

    expect(emitted.at(-1)).toEqual({
      method: 'pickup',
      pickupAddressId: null,
      deliveryAddressId: null,
    });
  });

  it('prévient quand la société n’a aucune adresse à préférer', () => {
    const { host } = render({
      preference: { method: 'delivery', pickupAddressId: null, deliveryAddressId: null },
      deliveries: [],
    });

    expect(host.textContent).toContain("n'a pas encore d'adresse de livraison");
  });

  it('MASQUE la livraison quand le service est fermé', () => {
    // Proposer un acheminement que la plateforme ne rend pas serait une promesse
    // que personne ne peut tenir.
    const { host } = render({ deliveryOffered: false });

    const buttons = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(buttons).toContain('Retrait');
    expect(buttons).not.toContain('Livraison');
  });

  it('sait retirer la préférence', () => {
    const { section, emitted } = render({
      preference: { method: 'pickup', pickupAddressId: 'pick_2', deliveryAddressId: null },
    });

    section['clear']();

    expect(emitted.at(-1)).toEqual(NO_FULFILLMENT_PREFERENCE);
  });
});
