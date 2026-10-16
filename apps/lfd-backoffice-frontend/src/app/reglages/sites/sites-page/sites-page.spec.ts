import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { SiteView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DeliveryAvailabilityService } from '../../../b2b/reglages/delivery-availability.service';
import { SitesService } from '../sites.service';
import { roleLabels, SitesPage } from './sites-page';

/**
 * **La liste des sites** (l'ancienne page des points de retrait). Ce qu'elle tient de neuf : la remise d'un
 * point se lit avec sa clientèle, faute de quoi une remise réservée aux pros
 * se lirait comme offerte à tous.
 */

const LABO: SiteView = {
  id: 'pick_1',
  label: 'Labo',
  ligne1: '3 rue du Four',
  ligne2: '',
  codePostal: '75011',
  ville: 'Paris',
  pays: 'France',
  discount: { mode: 'amount', cents: 800 },
  discountAudiences: { b2b: true, b2c: false },
  opening: { publicOpening: null, proPickup: null },
  gps: null,
  pickup: true,
  supply: 'on_site',
  deliveryDeparture: true,
  transferMode: 'integrated',
  counterSetupMinutes: 0,
  pickupColorB2b: null,
  pickupColorB2c: null,
  deliveryColorB2b: null,
  deliveryColorB2c: null,
  archivedAt: null,
  isDeparture: false,
};

/** À qui la livraison est proposée ; `Error` : la lecture échoue. */
type Delivery = { readonly openToB2b: boolean; readonly openToB2c: boolean } | Error;

async function mount(
  points: readonly SiteView[] | Error,
  delivery: Delivery = { openToB2b: true, openToB2c: true },
): Promise<ComponentFixture<SitesPage>> {
  TestBed.configureTestingModule({
    imports: [SitesPage],
    providers: [
      {
        provide: DeliveryAvailabilityService,
        useValue: {
          readPublic: () =>
            delivery instanceof Error ? Promise.reject(delivery) : Promise.resolve(delivery),
        },
      },
      // La liste NAVIGUE vers la page d'un point depuis le 2026-09-16 : sans
      // routeur, l'injection échoue avant le premier rendu.
      provideRouter([]),
      {
        provide: SitesService,
        useValue: {
          list: () => (points instanceof Error ? Promise.reject(points) : Promise.resolve(points)),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SitesPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('SitesPage', () => {
  it('dit la remise AVEC sa clientèle', async () => {
    const fixture = await mount([LABO]);

    expect(fixture.componentInstance['discountLabel'](LABO)).toMatch(/^− .+ · B2B$/);
  });

  it('ne dit pas de clientèle quand la remise vise les deux', async () => {
    const both = { ...LABO, discountAudiences: { b2b: true, b2c: true } };
    const fixture = await mount([both]);

    expect(fixture.componentInstance['discountLabel'](both)).not.toContain('·');
  });

  it('dit l’absence de point par un état vide fold', async () => {
    const fixture = await mount([]);

    expect(fixture.nativeElement.textContent).toContain('Aucun site');
  });

  it('dit l’échec de chargement par un état d’erreur fold', async () => {
    const fixture = await mount(new Error('réseau'));

    expect(fixture.nativeElement.textContent).toContain('Impossible de charger les sites');
  });

  it('dit les rôles d’un site, et marque l’archivé', async () => {
    const archived = {
      ...LABO,
      id: 'pick_2',
      archivedAt: '2026-10-13T08:00:00.000Z',
    };
    const fixture = await mount([LABO, archived]);
    const text: string = fixture.nativeElement.textContent;

    expect(text).toContain('Livraison');
    expect(text).toContain('Archivé');
    // Plus de site par défaut (Hugo, 2026-10-15) : plus de badge pour le dire.
    expect(text).not.toContain('Par défaut');
  });
});

/**
 * 2026-10-16 : plus de site par défaut — rien ne garantit qu'un site reste
 * ouvert au retrait d'une clientèle. L'écran le montre, sans bloquer.
 */
describe('SitesPage — les clientèles sans site de retrait', () => {
  const gap = (fixture: ComponentFixture<SitesPage>, audience: string): HTMLElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector(`[data-gap="${audience}"]`);

  it('ne dit rien quand chaque clientèle a un site', async () => {
    const fixture = await mount([LABO]);

    expect(gap(fixture, 'b2c')).toBeNull();
    expect(gap(fixture, 'b2b')).toBeNull();
  });

  it('🔴 signale les particuliers sans site de retrait, la livraison leur restant ouverte', async () => {
    const fixture = await mount([{ ...LABO, pickupAudiences: { b2b: true, b2c: false } }]);

    expect(gap(fixture, 'b2c')?.textContent?.trim()).toBe(
      'Aucun site de retrait pour les particuliers : le retrait ne leur est pas proposé.',
    );
    expect(fixture.componentInstance['gaps']()).toEqual([
      expect.objectContaining({ audience: 'b2c', variant: 'warning' }),
    ]);
    expect(gap(fixture, 'b2b')).toBeNull();
  });

  it('🔴 passe en alerte quand la livraison est fermée aussi', async () => {
    const fixture = await mount([{ ...LABO, pickupAudiences: { b2b: false, b2c: true } }], {
      openToB2b: false,
      openToB2c: true,
    });

    expect(gap(fixture, 'b2b')?.textContent?.trim()).toBe(
      'Les pros ne peuvent plus commander : ni retrait, ni livraison.',
    );
    expect(fixture.componentInstance['gaps']()).toEqual([
      expect.objectContaining({ audience: 'b2b', variant: 'alert' }),
    ]);
  });

  it('ne compte ni un site archivé ni un site sans retrait', async () => {
    const fixture = await mount([
      { ...LABO, archivedAt: '2026-10-13T08:00:00.000Z' },
      { ...LABO, id: 'pick_2', pickup: false },
    ]);

    expect(gap(fixture, 'b2c')).not.toBeNull();
    expect(gap(fixture, 'b2b')).not.toBeNull();
  });

  it('reste en simple signalement quand le réglage de livraison ne se lit pas', async () => {
    const fixture = await mount([], new Error('réseau'));

    expect(fixture.componentInstance['gaps']().map((g) => g.variant)).toEqual([
      'warning',
      'warning',
    ]);
  });
});

describe('roleLabels', () => {
  it('nomme le transfert par son mode', () => {
    const village: SiteView = {
      ...LABO,
      supply: 'transfer',
      deliveryDeparture: false,
      transferMode: 'dedicated',
    };

    expect(roleLabels(village)).toEqual(['Retrait', 'Transfert dédié']);
  });

  it('dit la clientèle d’un retrait réservé (Hugo, 2026-10-15)', () => {
    expect(roleLabels({ ...LABO, pickupAudiences: { b2b: true, b2c: false } })[0]).toBe(
      'Retrait pros',
    );
    expect(roleLabels({ ...LABO, pickupAudiences: { b2b: false, b2c: true } })[0]).toBe(
      'Retrait particuliers',
    );
    expect(roleLabels({ ...LABO, pickupAudiences: { b2b: true, b2c: true } })[0]).toBe('Retrait');
  });

  it('ne dit rien d’un rôle absent', () => {
    expect(roleLabels({ ...LABO, pickup: false })).toEqual(['Livraison']);
  });
});
