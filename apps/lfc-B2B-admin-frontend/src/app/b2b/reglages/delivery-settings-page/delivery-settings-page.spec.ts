import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DeliverySettingsPatch, DeliverySettingsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DeliverySettingsService } from '../delivery-settings.service';
import { DeliveryZonesService } from '../delivery-zones.service';
import { DeliverySettingsPage } from './delivery-settings-page';

/**
 * **La carte « Livraison »** (plan « remise et livraison par clientèle », D4 et
 * D6) : deux cases enregistrées au geste, une phrase en clair sous une case
 * décochée, et une case qui revient à ce que tient le serveur quand il refuse.
 */

const OPEN: DeliverySettingsView = {
  openToB2b: true,
  openToB2c: true,
  updatedAt: null,
  updatedBy: null,
};

class FakeSettings {
  readonly patches: DeliverySettingsPatch[] = [];
  refusal: unknown = null;

  constructor(private current: DeliverySettingsView | Error) {}

  read(): Promise<DeliverySettingsView> {
    return this.current instanceof Error
      ? Promise.reject(this.current)
      : Promise.resolve(this.current);
  }

  update(patch: DeliverySettingsPatch): Promise<DeliverySettingsView> {
    this.patches.push(patch);
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    const base = this.current instanceof Error ? OPEN : this.current;
    const saved: DeliverySettingsView = {
      openToB2b: patch.openToB2b ?? base.openToB2b,
      openToB2c: patch.openToB2c ?? base.openToB2c,
      updatedAt: '2026-09-15T08:00:00.000Z',
      updatedBy: 'Hugo',
    };
    this.current = saved;
    return Promise.resolve(saved);
  }
}

async function mount(settings: FakeSettings): Promise<ComponentFixture<DeliverySettingsPage>> {
  TestBed.configureTestingModule({
    imports: [DeliverySettingsPage],
    providers: [
      { provide: DeliverySettingsService, useValue: settings },
      { provide: DeliveryZonesService, useValue: { list: () => Promise.resolve([]) } },
    ],
  });
  const fixture = TestBed.createComponent(DeliverySettingsPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<DeliverySettingsPage>): string =>
  fixture.nativeElement.textContent ?? '';

describe('DeliverySettingsPage — la carte « Livraison »', () => {
  it('ne dit rien de fermé quand la livraison est ouverte aux deux', async () => {
    const fixture = await mount(new FakeSettings(OPEN));

    expect(text(fixture)).not.toContain('ne peuvent plus choisir la livraison');
  });

  it('écrit en clair ce qu’une case décochée retire', async () => {
    const fixture = await mount(new FakeSettings({ ...OPEN, openToB2c: false }));

    expect(text(fixture)).toContain('Les particuliers ne peuvent plus choisir la livraison.');
    expect(text(fixture)).not.toContain('Les pros ne peuvent plus choisir la livraison.');
  });

  it('enregistre la case au geste, et seulement elle', async () => {
    const settings = new FakeSettings(OPEN);
    const fixture = await mount(settings);

    await fixture.componentInstance['toggle']('b2b', false);
    fixture.detectChanges();

    expect(settings.patches).toEqual([{ openToB2b: false }]);
    expect(text(fixture)).toContain('Les pros ne peuvent plus choisir la livraison.');
  });

  it('🔴 remet la case à ce que tient le serveur quand il refuse, et le dit', async () => {
    // Une case laissée décochée affirmerait un réglage qui n'existe pas.
    const settings = new FakeSettings(OPEN);
    settings.refusal = { status: 403, error: { message: 'Droit insuffisant.' } };
    const fixture = await mount(settings);

    await fixture.componentInstance['toggle']('b2c', false);
    fixture.detectChanges();

    expect(fixture.componentInstance['settings']()).toEqual(OPEN);
    expect(text(fixture)).not.toContain('Les particuliers ne peuvent plus choisir la livraison.');
    const alert: HTMLElement | null = fixture.nativeElement.querySelector('fold-callout.v-alert');
    expect(alert?.textContent).toContain('Droit insuffisant.');
  });

  it('montre l’erreur de chargement par fold, avec de quoi réessayer', async () => {
    const fixture = await mount(new FakeSettings(new Error('réseau')));

    expect(fixture.nativeElement.querySelector('fold-empty-state')).not.toBeNull();
    expect(text(fixture)).toContain('Réessayer');
  });
});
