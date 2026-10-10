import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  DeliveryAvailabilityPatch,
  DeliveryAvailabilityView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
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
  windowMode: 'slot',
  updatedAt: null,
  updatedBy: null,
};

const EVERYTHING: readonly StaffPermission[] = [
  'delivery_availability:read',
  'delivery_availability:write',
  'delivery_fee:read',
  'delivery_fee:write',
];

class FakeSettings {
  readonly patches: DeliveryAvailabilityPatch[] = [];
  reads = 0;
  refusal: unknown = null;

  constructor(private current: DeliveryAvailabilityView | Error) {}

  read(): Promise<DeliveryAvailabilityView> {
    this.reads += 1;
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
      windowMode: patch.windowMode ?? base.windowMode,
      deliveryMarginMinutes:
        patch.deliveryMarginMinutes === undefined
          ? (base.deliveryMarginMinutes ?? null)
          : patch.deliveryMarginMinutes,
      pickupMarginMinutes:
        patch.pickupMarginMinutes === undefined
          ? (base.pickupMarginMinutes ?? null)
          : patch.pickupMarginMinutes,
      updatedAt: '2026-09-15T08:00:00.000Z',
      updatedBy: 'Hugo',
    };
    return Promise.resolve();
  }
}

async function mount(
  settings: FakeSettings,
  granted: readonly StaffPermission[] = EVERYTHING,
): Promise<ComponentFixture<DeliveryAvailabilityPage>> {
  TestBed.configureTestingModule({
    imports: [DeliveryAvailabilityPage],
    providers: [
      { provide: DeliveryAvailabilityService, useValue: settings },
      { provide: DeliveryZonesService, useValue: { list: () => Promise.resolve([]) } },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
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
    expect(fixture.componentInstance['draft']()).toEqual({
      openToB2b: true,
      openToB2c: false,
      windowMode: 'slot',
      deliveryMarginMinutes: null,
      pickupMarginMinutes: null,
    });
    const alert: HTMLElement | null = fixture.nativeElement.querySelector('fold-callout.v-alert');
    expect(alert?.textContent).toContain('Droit insuffisant.');
  });

  it('montre l’erreur de chargement par fold, avec de quoi réessayer', async () => {
    const fixture = await mount(new FakeSettings(new Error('réseau')));

    expect(fixture.nativeElement.querySelector('fold-empty-state')).not.toBeNull();
    expect(text(fixture)).toContain('Réessayer');
  });

  it('passe en échéance par le seul champ qui change, et relit', async () => {
    const settings = new FakeSettings(OPEN);
    const fixture = await mount(settings);

    fixture.componentInstance['setWindowMode']('deadline');
    await fixture.componentInstance['save']();

    expect(settings.patches).toEqual([{ windowMode: 'deadline' }]);
    expect(fixture.componentInstance['settings']()?.windowMode).toBe('deadline');
  });

  it('ignore une valeur de segment hors du contrat', async () => {
    const fixture = await mount(new FakeSettings(OPEN));

    fixture.componentInstance['setWindowMode']('nimporte');

    expect(fixture.componentInstance['draft']()?.windowMode).toBe('slot');
  });

  it('enregistre la seule marge changée, et la relit', async () => {
    const settings = new FakeSettings({
      ...OPEN,
      deliveryMarginMinutes: null,
      pickupMarginMinutes: 30,
    });
    const fixture = await mount(settings);

    expect(text(fixture)).toContain('une seule échéance');
    fixture.componentInstance['setMargin']('deliveryMarginMinutes', 90);
    await fixture.componentInstance['save']();

    expect(settings.patches).toEqual([{ deliveryMarginMinutes: 90 }]);
    expect(fixture.componentInstance['settings']()?.deliveryMarginMinutes).toBe(90);
  });

  it('vider une marge envoie null : elle n’est plus réglée', async () => {
    const settings = new FakeSettings({
      ...OPEN,
      deliveryMarginMinutes: 90,
      pickupMarginMinutes: 30,
    });
    const fixture = await mount(settings);

    fixture.componentInstance['setMargin']('pickupMarginMinutes', null);
    await fixture.componentInstance['save']();

    expect(settings.patches).toEqual([{ pickupMarginMinutes: null }]);
  });

  it('une marge absente de la vue compte comme non réglée, sans rien à enregistrer', async () => {
    const fixture = await mount(new FakeSettings(OPEN));

    expect(fixture.componentInstance['draft']()?.deliveryMarginMinutes).toBeNull();
    expect(saveButton(fixture).disabled).toBe(true);
  });

  /**
   * Deux droits sur une page (2026-10-10) : la disponibilité sous
   * `delivery_availability`, les zones sous `delivery_fee`.
   */
  it('sans la disponibilité en lecture, ne la charge pas et ne montre que les zones', async () => {
    const settings = new FakeSettings(OPEN);
    const fixture = await mount(settings, ['delivery_fee:read']);
    const host = fixture.nativeElement as HTMLElement;
    expect(settings.reads).toBe(0);
    expect(host.querySelector('.availability')).toBeNull();
    expect(host.querySelector('app-delivery-zones-section')).not.toBeNull();
    expect(host.textContent).not.toContain('Ajouter une zone');
  });

  it('en lecture seule, montre la disponibilité sans « Enregistrer »', async () => {
    const fixture = await mount(new FakeSettings(OPEN), ['delivery_availability:read']);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.availability')).not.toBeNull();
    expect(host.textContent).not.toContain('Enregistrer');
  });
});
