import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { VehiclePayload, VehicleView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
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
    expect(wire.adds).toEqual([{ name: 'Kangoo blanc', plate: 'ab 123 cd' }]);
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
      { id: 'veh_1', payload: { name: 'Kangoo blanc', plate: 'AB-123-CD' } },
    ]);
    expect(wire.closes).toEqual([true]);
  });
});
