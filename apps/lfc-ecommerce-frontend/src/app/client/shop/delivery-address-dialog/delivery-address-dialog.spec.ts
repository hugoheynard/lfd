import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DeliveryAddressView, DeliveryZoneView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ClientAddresses } from '../../client-addresses.service';
import type { ServiceChoice } from '../../order-context.store';
import { ServicePoints } from '../pickup-points.store';
import { DeliveryAddressDialog } from './delivery-address-dialog';

/** Une zone à 6,90 € — un MONTANT, la forme la plus simple à assurer. */
const ZONE: DeliveryZoneView = {
  id: 'z1',
  label: 'Val d’Isère',
  postalPrefixes: ['73150'],
  fee: { mode: 'amount', cents: 690 },
};

function address(over: Partial<DeliveryAddressView> & { id: string }): DeliveryAddressView {
  return {
    label: 'Chalet',
    ligne1: '12 chemin des Barmettes',
    ligne2: '',
    codePostal: '73150',
    ville: "Val d'Isère",
    pays: 'France',
    isDefault: false,
    specs: {
      note: '',
      slots: { mode: 'everyday', slot: null },
      deliveryContact: null,
      gps: null,
      signatureRequired: null,
    },
    ...over,
  } as DeliveryAddressView;
}

function boot(book: readonly DeliveryAddressView[], currentId: string | null = null) {
  const closed: (ServiceChoice | undefined)[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DeliveryAddressDialog],
    providers: [
      { provide: ClientAddresses, useValue: { deliveries: signal(book) } },
      {
        provide: ServicePoints,
        useValue: {
          hydrate: (): Promise<void> => Promise.resolve(),
          // Une seule zone servie : tout ce qui n'est pas en 73150 est dehors.
          zoneFor: (code: string): DeliveryZoneView | null => (code === '73150' ? ZONE : null),
          nextDayFor: (): string | null => '2026-09-21',
        },
      },
      {
        provide: FoldPanelRef,
        useValue: { close: (v: ServiceChoice | undefined) => closed.push(v) },
      },
    ],
  });
  const fixture = TestBed.createComponent(DeliveryAddressDialog);
  fixture.componentRef.setInput('data', { currentId });
  fixture.detectChanges();
  return { fixture, closed };
}

const rows = (fixture: ComponentFixture<DeliveryAddressDialog>): readonly HTMLElement[] => [
  ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.entry'),
];

const cta = (fixture: ComponentFixture<DeliveryAddressDialog>): HTMLButtonElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector('.cta');

describe('DeliveryAddressDialog', () => {
  it('coche l’adresse par défaut quand le carnet arrive', () => {
    const { fixture } = boot([address({ id: 'a' }), address({ id: 'b', isDefault: true })]);

    expect(rows(fixture)[1]?.getAttribute('aria-checked')).toBe('true');
    expect(rows(fixture)[0]?.getAttribute('aria-checked')).toBe('false');
  });

  /**
   * L'action PORTE le montant : on sait ce qu'on paie avant d'avoir composé le
   * panier. Les frais viennent de la ZONE, jamais du contenu.
   */
  it('met le tarif de la zone dans l’action', () => {
    const { fixture } = boot([address({ id: 'a', isDefault: true })]);

    expect(cta(fixture)?.textContent).toContain('6,90');
  });

  /**
   * 🔴 HORS ZONE : la rangée reste LISIBLE et dit pourquoi, mais ne se retient
   * pas. Le refus précède l'effort — il n'attend pas le clic sur l'action.
   */
  it('refuse une adresse hors zone, et le dit', () => {
    const { fixture, closed } = boot([address({ id: 'a', codePostal: '75002' })]);

    rows(fixture)[0]?.click();
    fixture.detectChanges();

    expect(rows(fixture)[0]?.textContent).toContain('Hors zone');
    expect(cta(fixture)?.disabled).toBe(true);
    expect(closed).toEqual([]);
  });

  /**
   * 🔴 AUCUNE FENÊTRE N'EST ENVOYÉE. Une heure partie d'ici s'écrirait sur un
   * bon de commande opposable, et aucune heure de livraison n'a de source — pas
   * même celle du carnet, dont l'identifiant ne part pas encore.
   */
  it('rend le mode complet, SANS fenêtre', () => {
    const { fixture, closed } = boot([address({ id: 'a', isDefault: true })]);

    cta(fixture)?.click();

    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({
      mode: 'delivery',
      window: null,
      codePostal: '73150',
      date: '2026-09-21',
    });
  });

  /**
   * ⚠️ La fenêtre du carnet se MONTRE quand elle est globale, et seulement
   * alors : un carnet peut en déclarer une par jour, et la journée de livraison
   * ne se choisit pas ici — en nommer une reviendrait à tirer un jour au sort.
   */
  it('montre la fenêtre du carnet quand elle vaut tous les jours', () => {
    const { fixture } = boot([
      address({
        id: 'a',
        isDefault: true,
        specs: {
          note: '',
          slots: { mode: 'everyday', slot: { start: '09:00', end: '11:00' } },
          deliveryContact: null,
          gps: null,
          signatureRequired: null,
        },
      } as Partial<DeliveryAddressView> & { id: string }),
    ]);

    expect(rows(fixture)[0]?.textContent).toContain('9');
  });

  it('ne montre AUCUNE fenêtre quand le carnet n’en déclare pas', () => {
    const { fixture } = boot([address({ id: 'a', isDefault: true })]);

    expect(rows(fixture)[0]?.querySelector('.window')).toBeNull();
  });

  /** Carnet vide : on dit où il se remplit, on n'ouvre pas un formulaire. */
  it('dit où les adresses se règlent quand le carnet est vide', () => {
    const { fixture } = boot([]);

    expect(rows(fixture)).toHaveLength(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Mon compte');
    expect(cta(fixture)?.disabled).toBe(true);
  });
});
