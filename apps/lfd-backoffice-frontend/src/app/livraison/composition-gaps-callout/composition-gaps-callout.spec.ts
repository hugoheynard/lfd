import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { DeliveryCompositionGapsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DeliveryRoundsService } from '../delivery-rounds.service';
import { CompositionGapsCallout } from './composition-gaps-callout';

async function mount(read: () => Promise<DeliveryCompositionGapsView>): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: DeliveryRoundsService,
        useValue: { compositionGaps: read } satisfies Partial<
          Record<keyof DeliveryRoundsService, unknown>
        >,
      },
    ],
  });
  const fixture = TestBed.createComponent(CompositionGapsCallout);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/**
 * Régression : sans véhicule mesuré ni bac en service, la composition
 * automatique échouait dans les journaux seulement (2026-10-22).
 */
describe('CompositionGapsCallout', () => {
  it('rien ne manque : il ne rend rien', async () => {
    const element = await mount(() => Promise.resolve({ gaps: [] }));

    expect(element.querySelector('fold-callout')).toBeNull();
  });

  it('aucun bac en service : le dit, et mène à Réglages › Livraison › Bacs', async () => {
    const element = await mount(() => Promise.resolve({ gaps: ['no_active_bin_type'] }));

    const callout = element.querySelector('[data-composition-gap="no_active_bin_type"]');
    expect(callout?.textContent).toContain(
      'Les tournées ne peuvent pas être composées : aucun type de bac n’est en service',
    );
    expect(callout?.querySelector('a')?.getAttribute('href')).toBe('/reglages/livraison/bacs');
  });

  it('les deux manques : un avertissement chacun, le véhicule mène aux Véhicules', async () => {
    const element = await mount(() =>
      Promise.resolve({ gaps: ['no_measured_vehicle', 'no_active_bin_type'] }),
    );

    expect(element.querySelectorAll('[data-composition-gap]')).toHaveLength(2);
    expect(
      element.querySelector('[data-composition-gap="no_measured_vehicle"] a')?.getAttribute('href'),
    ).toBe('/reglages/livraison/vehicules');
  });

  it('la lecture échoue : il le dit plutôt que de se taire', async () => {
    const element = await mount(() => Promise.reject(new Error('réseau')));

    expect(element.querySelector('[data-composition-gaps-failed]')).not.toBeNull();
  });
});
