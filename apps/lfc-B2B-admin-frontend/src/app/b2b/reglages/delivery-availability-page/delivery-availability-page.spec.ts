import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DeliveryAvailabilityPatch, DeliveryAvailabilityView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DeliveryAvailabilityService } from '../delivery-availability.service';
import { DeliveryZonesService } from '../delivery-zones.service';
import { DeliveryAvailabilityPage } from './delivery-availability-page';

/**
 * **L'encart « Disponibilité de la livraison »** (plan « remise et livraison
 * par clientèle », D4 et D6) : les cases posent un brouillon, seul
 * « Enregistrer » écrit, et retirer la livraison à une clientèle s'annonce
 * avant d'être enregistré.
 */

const OPEN: DeliveryAvailabilityView = {
  openToB2b: true,
  openToB2c: true,
  updatedAt: null,
  updatedBy: null,
};

class FakeSettings {
  readonly patches: DeliveryAvailabilityPatch[] = [];
  refusal: unknown = null;

  constructor(private current: DeliveryAvailabilityView | Error) {}

  read(): Promise<DeliveryAvailabilityView> {
    return this.current instanceof Error
      ? Promise.reject(this.current)
      : Promise.resolve(this.current);
  }

  /** Comme la route : `204`, aucun corps. Le réglage se relit par `read`. */
  update(patch: DeliveryAvailabilityPatch): Promise<void> {
    this.patches.push(patch);
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    const base = this.current instanceof Error ? OPEN : this.current;
    this.current = {
      openToB2b: patch.openToB2b ?? base.openToB2b,
      openToB2c: patch.openToB2c ?? base.openToB2c,
      updatedAt: '2026-09-15T08:00:00.000Z',
      updatedBy: 'Hugo',
    };
    return Promise.resolve();
  }
}

async function mount(settings: FakeSettings): Promise<ComponentFixture<DeliveryAvailabilityPage>> {
  TestBed.configureTestingModule({
    imports: [DeliveryAvailabilityPage],
    providers: [
      { provide: DeliveryAvailabilityService, useValue: settings },
      { provide: DeliveryZonesService, useValue: { list: () => Promise.resolve([]) } },
    ],
  });
  const fixture = TestBed.createComponent(DeliveryAvailabilityPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<DeliveryAvailabilityPage>): string =>
  fixture.nativeElement.textContent ?? '';

const warning = (fixture: ComponentFixture<DeliveryAvailabilityPage>): HTMLElement | null =>
  fixture.nativeElement.querySelector('fold-callout.v-warning');

const saveButton = (fixture: ComponentFixture<DeliveryAvailabilityPage>): HTMLButtonElement => {
  const found = Array.from<HTMLButtonElement>(
    fixture.nativeElement.querySelectorAll('button'),
  ).find((b) => b.textContent?.trim() === 'Enregistrer');
  if (!found) {
    throw new Error('Pas de bouton Enregistrer.');
  }
  return found;
};

describe('DeliveryAvailabilityPage — la disponibilité de la livraison', () => {
  it('ne dit rien de fermé, et n’a rien à enregistrer, quand rien ne change', async () => {
    const fixture = await mount(new FakeSettings(OPEN));

    expect(text(fixture)).not.toContain('ne peuvent plus choisir la livraison');
    expect(warning(fixture)).toBeNull();
    expect(saveButton(fixture).disabled).toBe(true);
  });

  it('écrit en clair ce qu’une case décochée retire', async () => {
    const fixture = await mount(new FakeSettings({ ...OPEN, openToB2c: false }));

    expect(text(fixture)).toContain('Les particuliers ne peuvent plus choisir la livraison.');
    expect(text(fixture)).not.toContain('Les pros ne peuvent plus choisir la livraison.');
  });

  /**
   * Régression (2026-09-15) : un clic sur une case enregistrait tout de suite, et
   * retirait la livraison à toute une clientèle sans rien pour l'arrêter.
   */
  it('🔴 décocher n’écrit rien, et avertit AVANT d’enregistrer', async () => {
    const settings = new FakeSettings(OPEN);
    const fixture = await mount(settings);

    fixture.componentInstance['set']('b2c', false);
    fixture.detectChanges();

    expect(settings.patches).toEqual([]);
    expect(warning(fixture)?.textContent).toContain('retire la livraison aux particuliers');
    expect(saveButton(fixture).disabled).toBe(false);
  });

  it('enregistre la seule case changée, relit, et retire l’avertissement', async () => {
    const settings = new FakeSettings(OPEN);
    const fixture = await mount(settings);

    fixture.componentInstance['set']('b2b', false);
    await fixture.componentInstance['save']();
    fixture.detectChanges();

    expect(settings.patches).toEqual([{ openToB2b: false }]);
    expect(fixture.componentInstance['settings']()?.updatedBy).toBe('Hugo');
    expect(warning(fixture)).toBeNull();
    expect(saveButton(fixture).disabled).toBe(true);
    expect(text(fixture)).toContain('Les pros ne peuvent plus choisir la livraison.');
  });

  it('rouvrir une clientèle n’avertit de rien', async () => {
    const fixture = await mount(new FakeSettings({ ...OPEN, openToB2c: false }));

    fixture.componentInstance['set']('b2c', true);
    fixture.detectChanges();

    expect(warning(fixture)).toBeNull();
    expect(saveButton(fixture).disabled).toBe(false);
  });

  it('recocher ce qu’on vient de décocher n’a plus rien à enregistrer', async () => {
    const fixture = await mount(new FakeSettings(OPEN));

    fixture.componentInstance['set']('b2c', false);
    fixture.componentInstance['set']('b2c', true);
    fixture.detectChanges();

    expect(warning(fixture)).toBeNull();
    expect(saveButton(fixture).disabled).toBe(true);
  });

  it('un refus garde le brouillon à l’écran, et le dit', async () => {
    const settings = new FakeSettings(OPEN);
    settings.refusal = { status: 403, error: { message: 'Droit insuffisant.' } };
    const fixture = await mount(settings);

    fixture.componentInstance['set']('b2c', false);
    await fixture.componentInstance['save']();
    fixture.detectChanges();

    expect(fixture.componentInstance['settings']()).toEqual(OPEN);
    expect(fixture.componentInstance['draft']()).toEqual({ openToB2b: true, openToB2c: false });
    const alert: HTMLElement | null = fixture.nativeElement.querySelector('fold-callout.v-alert');
    expect(alert?.textContent).toContain('Droit insuffisant.');
  });

  it('montre l’erreur de chargement par fold, avec de quoi réessayer', async () => {
    const fixture = await mount(new FakeSettings(new Error('réseau')));

    expect(fixture.nativeElement.querySelector('fold-empty-state')).not.toBeNull();
    expect(text(fixture)).toContain('Réessayer');
  });
});
