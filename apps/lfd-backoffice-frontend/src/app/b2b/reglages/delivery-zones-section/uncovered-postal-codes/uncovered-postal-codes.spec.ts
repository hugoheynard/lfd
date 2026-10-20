import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { UncoveredPostalCodeView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DeliveryZonesService } from '../../delivery-zones.service';
import { UncoveredPostalCodes } from './uncovered-postal-codes';

/**
 * **L'avertissement des codes postaux hors zone** (2026-10-20) : rien quand
 * tout est couvert, un échec discret, et « Ajouter un tarif » rend le code.
 */

const TIGNES: UncoveredPostalCodeView = {
  postalCode: '73320',
  cities: ['Tignes'],
  companyCount: 4,
  companies: [
    { id: 'c1', name: 'La Folie' },
    { id: 'c2', name: 'Le Refuge' },
    { id: 'c3', name: 'Le Brévent' },
  ],
};

async function mount(
  answer: () => Promise<readonly UncoveredPostalCodeView[]>,
  canWrite = true,
): Promise<ComponentFixture<UncoveredPostalCodes>> {
  TestBed.configureTestingModule({
    imports: [UncoveredPostalCodes],
    providers: [
      provideRouter([]),
      { provide: DeliveryZonesService, useValue: { uncoveredPostalCodes: answer } },
    ],
  });
  const fixture = TestBed.createComponent(UncoveredPostalCodes);
  fixture.componentRef.setInput('canWrite', canWrite);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<UncoveredPostalCodes>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('UncoveredPostalCodes', () => {
  it('ne montre rien quand toutes les adresses sont couvertes', async () => {
    const fixture = await mount(() => Promise.resolve([]));

    expect(fixture.nativeElement.querySelector('fold-callout')).toBeNull();
  });

  it('nomme le code, la ville, les comptes en lien et ceux qu’il tait', async () => {
    const fixture = await mount(() => Promise.resolve([TIGNES]));
    const host = fixture.nativeElement as HTMLElement;

    expect(text(fixture)).toContain('1 code postal');
    expect(text(fixture)).toContain('73320');
    expect(text(fixture)).toContain('Tignes');
    expect(text(fixture)).toContain('et 1 autre');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/comptes-clients/c1/informations');
  });

  it('« Ajouter un tarif » rend le code postal', async () => {
    const fixture = await mount(() => Promise.resolve([TIGNES]));
    const emitted: string[] = [];
    fixture.componentInstance.addZone.subscribe((code) => emitted.push(code));

    (fixture.nativeElement as HTMLElement).querySelector('button')?.click();

    expect(emitted).toEqual(['73320']);
  });

  it('sans le droit d’écrire, avertit sans proposer le geste', async () => {
    const fixture = await mount(() => Promise.resolve([TIGNES]), false);

    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('un échec de lecture reste un callout discret', async () => {
    const fixture = await mount(() => Promise.reject(new Error('503')));

    expect(text(fixture)).toContain('Impossible de vérifier');
  });
});
