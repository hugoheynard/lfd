import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CartAdjustment, PickupAddressView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ClientAudience } from '../../client-audience.service';
import { ServicePoints } from '../pickup-points.store';
import { PublicHousePickerDialog } from './public-house-picker-dialog';

/** Un point COMPLET : aucun cast, donc rien qui puisse mentir sur sa forme. */
function point(
  id: string,
  label: string,
  discount: CartAdjustment | null = null,
): PickupAddressView {
  return {
    id,
    label,
    ligne1: 'Route de la Balme',
    ligne2: '',
    codePostal: '73150',
    ville: "Val d'Isère",
    pays: 'France',
    isDefault: false,
    discount,
    discountAudiences: { b2b: true, b2c: true },
    opening: { publicOpening: { start: '07:00', end: '12:00' }, proPickup: null },
  };
}

const LABO = point('pick_labo', 'Le Labo');
const VILLAGE = point('pick_village', 'Le Village', { mode: 'percent', bp: 1000 });

interface Monde {
  readonly currentId?: string | null;
  readonly points?: readonly PickupAddressView[];
}

/** Ce que le dialogue a rendu en se fermant — `undefined` tant qu'il est ouvert. */
interface Closed {
  readonly results: unknown[];
}

function boot({ currentId = null, points = [LABO, VILLAGE] }: Monde = {}): {
  readonly fixture: ComponentFixture<PublicHousePickerDialog>;
  readonly closed: Closed;
} {
  const closed: Closed = { results: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PublicHousePickerDialog],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ClientAudience, useValue: { shown: () => 'b2c', current: () => 'b2c' } },
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef(1, (result: unknown) => closed.results.push(result)),
      },
    ],
  });
  // Le VRAI dépôt, semé : `receive()` tient l'hydratation pour faite, donc le
  // constructeur du dialogue ne part chercher personne.
  TestBed.inject(ServicePoints).receive([...points], []);
  const fixture = TestBed.createComponent(PublicHousePickerDialog);
  fixture.componentRef.setInput('data', { currentId });
  fixture.detectChanges();
  return { fixture, closed };
}

const houses = (fixture: ComponentFixture<PublicHousePickerDialog>): HTMLButtonElement[] => [
  ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.house'),
];

describe('PublicHousePickerDialog', () => {
  it('propose une carte par maison ouverte', () => {
    expect(houses(boot().fixture)).toHaveLength(2);
  });

  it('nomme chaque maison par son enseigne', () => {
    const [premier] = houses(boot().fixture);

    expect(premier?.querySelector('.name')?.textContent?.trim()).toBe('Le Labo');
  });

  /** Sans repère, on ne sait plus ce qu'on avait retenu en rouvrant le choix. */
  it('marque la maison déjà retenue, et elle seule', () => {
    const rendered = houses(boot({ currentId: 'pick_village' }).fixture);

    expect(rendered.filter((house) => house.classList.contains('on'))).toHaveLength(1);
    expect(rendered[1]?.classList.contains('on')).toBe(true);
    expect(rendered[1]?.querySelector('.tag')).not.toBeNull();
  });

  it('ne marque rien quand aucune maison n’a encore été choisie', () => {
    expect(houses(boot().fixture).filter((h) => h.classList.contains('on'))).toHaveLength(0);
  });

  /**
   * 🔴 Le dialogue rend le POINT, il ne décide pas de la suite : changer de
   * maison périme l'heure, et c'est l'appelant qui enchaîne sur le sélecteur.
   */
  it('rend le point choisi en se fermant', () => {
    const { fixture, closed } = boot();

    houses(fixture)[1]?.click();

    expect(closed.results).toEqual([VILLAGE]);
  });

  /**
   * ⚠️ Sans remise, l'étiquette annonce un TARIF et non un gain : elle est
   * alors rendue en sourdine (`is-plain`). La distinction est ce qui empêche
   * « Prix boutique » de ressembler à un avantage.
   */
  it('distingue une vraie remise d’un simple tarif', () => {
    const rendered = houses(boot().fixture);

    expect(rendered[0]?.querySelector('.offer')?.classList.contains('is-plain')).toBe(true);
    expect(rendered[1]?.querySelector('.offer')?.classList.contains('is-plain')).toBe(false);
  });
});
