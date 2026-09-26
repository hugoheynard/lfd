import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type {
  LoyaltySettingsView,
  SetLoyaltySettingsPayload,
  StaffPermission,
} from '@lfd/contracts';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { LoyaltyService } from '../../loyalty.service';
import { LoyaltySettings } from './loyalty-settings';

/**
 * Ce que ces cas tiennent : tant que rien n'est enregistré le programme est
 * fermé et le premier enregistrement propose 365 jours ; la valeur part en
 * centimes entiers ; les pros restent fermés ; changer le RATIO d'un programme
 * réglé demande une confirmation qui dit ce que ça change ; sans
 * `b2b_accounting:write`, rien ne s'enregistre.
 */

const SET: NonNullable<LoyaltySettingsView['settings']> = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
};

class FakeApi {
  settings: LoyaltySettingsView['settings'] = null;
  saved: SetLoyaltySettingsPayload[] = [];

  readSettings(): Promise<LoyaltySettingsView> {
    return Promise.resolve({ settings: this.settings });
  }

  saveSettings(payload: SetLoyaltySettingsPayload): Promise<void> {
    this.saved.push(payload);
    return Promise.resolve();
  }
}

const WRITE: readonly StaffPermission[] = ['b2b_accounting:read', 'b2b_accounting:write'];

async function render(
  api: FakeApi,
  permissions: readonly StaffPermission[] = WRITE,
): Promise<ComponentFixture<LoyaltySettings>> {
  TestBed.configureTestingModule({
    imports: [LoyaltySettings],
    providers: [
      { provide: LoyaltyService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(LoyaltySettings);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<LoyaltySettings>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

const root = (fixture: ComponentFixture<LoyaltySettings>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const text = (fixture: ComponentFixture<LoyaltySettings>): string =>
  root(fixture).textContent ?? '';

function button(fixture: ComponentFixture<LoyaltySettings>, label: string): HTMLButtonElement {
  const found = Array.from(root(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.textContent?.trim() === label,
  );
  if (found === undefined) {
    throw new Error(`bouton « ${label} » introuvable`);
  }
  return found;
}

function hasButton(fixture: ComponentFixture<LoyaltySettings>, label: string): boolean {
  return Array.from(root(fixture).querySelectorAll('button')).some(
    (b) => b.textContent?.trim() === label,
  );
}

/** Les champs, dans l'ordre de l'écran : points, valeur, validité. */
function fields(fixture: ComponentFixture<LoyaltySettings>): HTMLInputElement[] {
  return Array.from(
    root(fixture).querySelectorAll<HTMLInputElement>('fold-number-input input, fold-input input'),
  );
}

function type(fixture: ComponentFixture<LoyaltySettings>, index: number, value: string): void {
  const field = fields(fixture)[index];
  if (field === undefined) {
    throw new Error(`champ ${index} introuvable`);
  }
  field.value = value;
  field.dispatchEvent(new Event('input'));
  field.dispatchEvent(new Event('blur'));
  fixture.detectChanges();
}

describe('LoyaltySettings', () => {
  it('sans réglage, le programme est fermé et la validité propose 365 jours', async () => {
    const fixture = await render(new FakeApi());

    expect(text(fixture)).toContain('Programme fermé');
    expect(fields(fixture).map((f) => f.value)).toContain('365');
    expect(button(fixture, 'Ouvrir le programme').disabled).toBe(true);
  });

  it('le premier enregistrement envoie la valeur en centimes entiers, pros fermés', async () => {
    const api = new FakeApi();
    const fixture = await render(api);

    type(fixture, 0, '1000');
    type(fixture, 1, '5,50');
    button(fixture, 'Ouvrir le programme').click();
    await settle(fixture);

    expect(api.saved).toEqual([
      {
        pointsPerStep: 1_000,
        stepValueCents: 550,
        openToPublic: true,
        openToPro: false,
        voucherValidityDays: 365,
      },
    ]);
  });

  it('refuse une valeur plus fine que le centime', async () => {
    const fixture = await render(new FakeApi());

    type(fixture, 0, '1000');
    type(fixture, 1, '5,005');

    expect(button(fixture, 'Ouvrir le programme').disabled).toBe(true);
  });

  it('la clientèle pro ne se coche pas : elle attend « facture réglée »', async () => {
    const fixture = await render(new FakeApi());
    const boxes = Array.from(
      root(fixture).querySelectorAll<HTMLInputElement>('fold-checkbox input'),
    );

    expect(boxes).toHaveLength(2);
    expect(boxes[1]?.disabled).toBe(true);
    expect(text(fixture)).toContain('facture réglée');
  });

  it('changer le ratio demande une confirmation qui dit ce qui change', async () => {
    const api = new FakeApi();
    api.settings = SET;
    const fixture = await render(api);

    type(fixture, 1, '6');
    button(fixture, 'Enregistrer').click();
    await settle(fixture);

    expect(api.saved).toEqual([]);
    expect(text(fixture)).toContain('La valeur des points déjà gagnés change, pas leur nombre');
    expect(text(fixture)).toContain('Les bons déjà émis ne changent pas');

    button(fixture, 'Enregistrer le nouveau ratio').click();
    await settle(fixture);

    expect(api.saved).toEqual([{ ...SET, stepValueCents: 600 }]);
  });

  it('changer la seule validité s’enregistre sans confirmation', async () => {
    const api = new FakeApi();
    api.settings = SET;
    const fixture = await render(api);

    type(fixture, 2, '180');
    button(fixture, 'Enregistrer').click();
    await settle(fixture);

    expect(api.saved).toEqual([{ ...SET, voucherValidityDays: 180 }]);
  });

  it('sans droit d’écriture et sans réglage : « Programme fermé », aucun geste', async () => {
    const fixture = await render(new FakeApi(), ['b2b_accounting:read']);

    expect(text(fixture)).toContain('Programme fermé');
    expect(hasButton(fixture, 'Ouvrir le programme')).toBe(false);
  });

  it('sans droit d’écriture, un réglage posé se lit sans pouvoir s’enregistrer', async () => {
    const api = new FakeApi();
    api.settings = SET;
    const fixture = await render(api, ['b2b_accounting:read']);

    expect(text(fixture)).toMatch(/1\s000 points = 5,00\s€/u);
    expect(hasButton(fixture, 'Enregistrer')).toBe(false);
  });
});
