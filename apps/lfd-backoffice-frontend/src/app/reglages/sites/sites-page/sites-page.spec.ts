import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { SiteView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

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
  isDefault: true,
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

async function mount(points: readonly SiteView[] | Error): Promise<ComponentFixture<SitesPage>> {
  TestBed.configureTestingModule({
    imports: [SitesPage],
    providers: [
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
      isDefault: false,
      archivedAt: '2026-10-13T08:00:00.000Z',
    };
    const fixture = await mount([LABO, archived]);
    const text: string = fixture.nativeElement.textContent;

    expect(text).toContain('Livraison');
    expect(text).toContain('Archivé');
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

  it('ne dit rien d’un rôle absent', () => {
    expect(roleLabels({ ...LABO, pickup: false })).toEqual(['Livraison']);
  });
});
