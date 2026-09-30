import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { VehicleEnergy, VehiclePayload, VehicleView } from '@lfd/contracts';
import { FoldListboxComponent, FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { DeliverySettingsService } from '../delivery-settings.service';
import { VehicleDialog, type VehicleDialogData } from './vehicle-dialog';

interface Wire {
  adds: VehiclePayload[];
  updates: { id: string; payload: VehiclePayload }[];
  closes: unknown[];
  /** Le refus à rendre à la prochaine écriture, ou `null`. */
  refuse: string | null;
}

let wire: Wire;

const KANGOO: VehicleView = {
  id: 'veh_1',
  name: 'Kangoo',
  plate: 'AB-123-CD',
  retiredAt: null,
  createdAt: '2026-01-01T08:00:00.000Z',
  cargo: null,
  wheelArches: null,
  refrigeration: null,
  energy: null,
};

const FRIGO: VehicleView = {
  ...KANGOO,
  id: 'veh_2',
  name: 'Frigo',
  cargo: { lengthCm: 250, widthCm: 170, heightCm: 130, volumeLiters: 5525 },
  refrigeration: { volumeLiters: 400, minTempC: 0, maxTempC: 4 },
  energy: 'electric',
};

function write(): Promise<void> {
  return wire.refuse === null
    ? Promise.resolve()
    : Promise.reject(new HttpErrorResponse({ status: 409, error: { message: wire.refuse } }));
}

async function boot(data: VehicleDialogData): Promise<ComponentFixture<VehicleDialog>> {
  wire = { adds: [], updates: [], closes: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [VehicleDialog],
    providers: [
      {
        provide: DeliverySettingsService,
        useValue: {
          addVehicle: (payload: VehiclePayload) => {
            wire.adds.push(payload);
            return write();
          },
          updateVehicle: (id: string, payload: VehiclePayload) => {
            wire.updates.push({ id, payload });
            return write();
          },
        } satisfies Pick<DeliverySettingsService, 'addVehicle' | 'updateVehicle'>,
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(VehicleDialog);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<VehicleDialog>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const submitButton = (fixture: ComponentFixture<VehicleDialog>): HTMLButtonElement => {
  const button = host(fixture).querySelector<HTMLButtonElement>('button.vd-submit');
  if (button === null) throw new Error('Bouton d’envoi absent.');
  return button;
};

/** Saisit dans le n-ième `fold-input` (0 = nom, 1 = plaque). */
function type(fixture: ComponentFixture<VehicleDialog>, index: number, value: string): void {
  const input = host(fixture).querySelectorAll('fold-input input')[index];
  if (!(input instanceof HTMLInputElement)) throw new Error('Champ absent.');
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

/** Saisit dans le n-ième `fold-number-input` (0-2 = dimensions, 3-5 = froid). */
function typeNumber(fixture: ComponentFixture<VehicleDialog>, index: number, value: string): void {
  const input = host(fixture).querySelectorAll('fold-number-input input')[index];
  if (!(input instanceof HTMLInputElement)) throw new Error('Champ numérique absent.');
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

async function submit(fixture: ComponentFixture<VehicleDialog>): Promise<void> {
  submitButton(fixture).click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('VehicleDialog', () => {
  it('ajout : refuse l’envoi tant que le nom et la plaque manquent', async () => {
    const fixture = await boot({});
    expect(submitButton(fixture).disabled).toBe(true);

    type(fixture, 0, 'Kangoo blanc');
    expect(submitButton(fixture).disabled).toBe(true);

    type(fixture, 1, ' ab 123 cd ');
    expect(submitButton(fixture).disabled).toBe(false);
  });

  it('ajout : envoie la saisie rognée, et ferme sur un succès', async () => {
    const fixture = await boot({});
    type(fixture, 0, ' Kangoo blanc ');
    type(fixture, 1, 'ab 123 cd');
    await submit(fixture);

    // La plaque n'est pas normalisée ici : c'est le serveur qui fait foi.
    expect(wire.adds).toEqual([
      {
        name: 'Kangoo blanc',
        plate: 'ab 123 cd',
        cargo: null,
        wheelArches: null,
        refrigeration: null,
        energy: null,
      },
    ]);
    expect(wire.closes).toEqual([true]);
  });

  it('🔴 un refus du serveur reste affiché tel quel, dialogue ouvert', async () => {
    const fixture = await boot({});
    wire.refuse = 'La plaque AB-123-CD est déjà portée par « Trafic gris ».';
    type(fixture, 0, 'Kangoo');
    type(fixture, 1, 'AB123CD');
    await submit(fixture);

    expect(host(fixture).querySelector('fold-callout')?.textContent).toContain(
      'déjà portée par « Trafic gris »',
    );
    expect(wire.closes).toEqual([]);
  });

  it('correction : part du véhicule, et n’écrit rien tant que rien ne change', async () => {
    const fixture = await boot({ vehicle: KANGOO });
    expect(submitButton(fixture).disabled).toBe(true);
    expect(submitButton(fixture).textContent).toContain('Enregistrer');

    type(fixture, 0, 'Kangoo blanc');
    await submit(fixture);

    expect(wire.updates).toEqual([
      {
        id: 'veh_1',
        payload: {
          name: 'Kangoo blanc',
          plate: 'AB-123-CD',
          cargo: null,
          wheelArches: null,
          refrigeration: null,
          energy: null,
        },
      },
    ]);
    expect(wire.closes).toEqual([true]);
  });

  it('les dimensions : volume en direct, et les trois ou aucune', async () => {
    const fixture = await boot({});
    type(fixture, 0, 'Trafic');
    type(fixture, 1, 'AB123CD');
    typeNumber(fixture, 0, '250');
    expect(host(fixture).querySelector('[data-load-issue]')?.textContent).toContain(
      'les trois, ou aucune',
    );
    expect(submitButton(fixture).disabled).toBe(true);

    typeNumber(fixture, 1, '170');
    typeNumber(fixture, 2, '130');
    expect(host(fixture).querySelector('[data-volume]')?.textContent).toContain('5,5 m³');
    expect(submitButton(fixture).disabled).toBe(false);

    await submit(fixture);
    expect(wire.adds).toEqual([
      {
        name: 'Trafic',
        plate: 'AB123CD',
        cargo: { lengthCm: 250, widthCm: 170, heightCm: 130 },
        wheelArches: null,
        refrigeration: null,
        energy: null,
      },
    ]);
  });

  it('le froid : refuse min > max, envoie une plage négative', async () => {
    const fixture = await boot({ vehicle: KANGOO });
    const box = host(fixture).querySelector('[data-refrigerated] input');
    if (!(box instanceof HTMLInputElement)) throw new Error('Case absente.');
    box.click();
    fixture.detectChanges();

    typeNumber(fixture, 3, '300');
    typeNumber(fixture, 4, '-18');
    typeNumber(fixture, 5, '-20');
    expect(host(fixture).querySelector('[data-load-issue]')?.textContent).toContain(
      'minimale ne peut pas dépasser',
    );
    expect(submitButton(fixture).disabled).toBe(true);

    typeNumber(fixture, 4, '-22');
    await submit(fixture);
    expect(wire.updates[0]?.payload.refrigeration).toEqual({
      volumeLiters: 300,
      minTempC: -22,
      maxTempC: -20,
    });
  });

  it('🔴 corriger le nom garde l’énergie : absente, elle serait effacée', async () => {
    const fixture = await boot({ vehicle: FRIGO });
    type(fixture, 0, 'Frigo bleu');
    await submit(fixture);
    expect(wire.updates[0]?.payload.energy).toBe('electric');
  });

  it('l’énergie choisie part dans la charge ; effacée, elle part à null', async () => {
    const fixture = await boot({ vehicle: FRIGO });
    const listbox = fixture.debugElement.query(By.directive(FoldListboxComponent))
      .componentInstance as FoldListboxComponent<VehicleEnergy>;
    listbox.value.set('diesel');
    fixture.detectChanges();
    await submit(fixture);
    expect(wire.updates[0]?.payload.energy).toBe('diesel');

    listbox.value.set(null);
    fixture.detectChanges();
    await submit(fixture);
    expect(wire.updates[1]?.payload.energy).toBeNull();
  });

  it('🔴 corriger le nom renvoie la fiche entière : absent effacerait le chargement', async () => {
    const fixture = await boot({ vehicle: FRIGO });
    expect(submitButton(fixture).disabled).toBe(true);
    type(fixture, 0, 'Frigo blanc');
    await submit(fixture);

    expect(wire.updates[0]?.payload).toEqual({
      name: 'Frigo blanc',
      plate: 'AB-123-CD',
      cargo: { lengthCm: 250, widthCm: 170, heightCm: 130 },
      wheelArches: null,
      refrigeration: { volumeLiters: 400, minTempC: 0, maxTempC: 4 },
      energy: 'electric',
    });
  });

  /**
   * Régression (G4) : le dialogue n'envoyait pas `wheelArches`, et absent vaut
   * effacement côté serveur — toute correction depuis l'écran effaçait les
   * passages de roue du véhicule.
   */
  it('🔴 corriger le nom renvoie les passages de roue existants', async () => {
    const arches = { lengthCm: 90, protrusionCm: 20, fromBackCm: 60, heightCm: 30 };
    const fixture = await boot({ vehicle: { ...FRIGO, wheelArches: arches } });
    expect(submitButton(fixture).disabled).toBe(true);
    type(fixture, 0, 'Frigo blanc');
    await submit(fixture);
    expect(wire.updates[0]?.payload.wheelArches).toEqual(arches);
  });

  it('les passages de roue : proposés avec l’espace utile seulement, les quatre ou aucun', async () => {
    const fixture = await boot({});
    type(fixture, 0, 'Trafic');
    type(fixture, 1, 'AB123CD');
    expect(host(fixture).querySelector('[data-arches]')).toBeNull();

    typeNumber(fixture, 0, '250');
    typeNumber(fixture, 1, '170');
    typeNumber(fixture, 2, '130');
    const box = host(fixture).querySelector('[data-arches] input');
    if (!(box instanceof HTMLInputElement)) throw new Error('Case absente.');
    box.click();
    fixture.detectChanges();

    typeNumber(fixture, 3, '90');
    typeNumber(fixture, 4, '20');
    typeNumber(fixture, 5, '60');
    expect(host(fixture).querySelector('[data-load-issue]')?.textContent).toContain('les quatre');
    expect(submitButton(fixture).disabled).toBe(true);

    typeNumber(fixture, 6, '30');
    await submit(fixture);
    expect(wire.adds[0]?.wheelArches).toEqual({
      lengthCm: 90,
      protrusionCm: 20,
      fromBackCm: 60,
      heightCm: 30,
    });
  });

  it('un refus 400 des passages de roue s’affiche avec le message du serveur', async () => {
    const fixture = await boot({
      vehicle: {
        ...FRIGO,
        wheelArches: { lengthCm: 90, protrusionCm: 20, fromBackCm: 60, heightCm: 30 },
      },
    });
    wire.refuse = 'Les passages de roue dépassent le plancher.';
    type(fixture, 0, 'Frigo blanc');
    await submit(fixture);
    expect(host(fixture).textContent).toContain('dépassent le plancher');
    expect(wire.closes).toEqual([]);
  });
});
