import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { PurchaseVehicleCandidatePayload, PurchaseVehicleCandidateView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PurchaseLibraryService } from '../purchase-library.service';
import {
  PurchaseVehicleCandidateDialog,
  type PurchaseVehicleCandidateDialogData,
} from './purchase-vehicle-candidate-dialog';

interface Wire {
  adds: PurchaseVehicleCandidatePayload[];
  updates: { id: string; payload: PurchaseVehicleCandidatePayload }[];
  closes: unknown[];
  refuse: string | null;
}

let wire: Wire;

const TRAFIC: PurchaseVehicleCandidateView = {
  id: 'pv_1',
  name: 'Trafic',
  reference: null,
  purchaseUrl: null,
  createdAt: '2026-01-01T08:00:00.000Z',
  updatedAt: '2026-01-01T08:00:00.000Z',
  updatedBy: { staffUserId: 's1', name: 'Hugo', role: 'admin' },
  archivedAt: null,
  cargo: { lengthCm: 250, widthCm: 170, heightCm: 130, volumeLiters: 5525 },
  wheelArches: null,
  priceCentsExclVat: 1250,
};

function write(): Promise<void> {
  return wire.refuse === null
    ? Promise.resolve()
    : Promise.reject(new HttpErrorResponse({ status: 400, error: { message: wire.refuse } }));
}

async function boot(
  data: PurchaseVehicleCandidateDialogData,
): Promise<ComponentFixture<PurchaseVehicleCandidateDialog>> {
  wire = { adds: [], updates: [], closes: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PurchaseVehicleCandidateDialog],
    providers: [
      {
        provide: PurchaseLibraryService,
        useValue: {
          addVehicleCandidate: (payload: PurchaseVehicleCandidatePayload) => {
            wire.adds.push(payload);
            return write();
          },
          updateVehicleCandidate: (id: string, payload: PurchaseVehicleCandidatePayload) => {
            wire.updates.push({ id, payload });
            return write();
          },
        } satisfies Pick<PurchaseLibraryService, 'addVehicleCandidate' | 'updateVehicleCandidate'>,
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(PurchaseVehicleCandidateDialog);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<PurchaseVehicleCandidateDialog>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function type(
  fixture: ComponentFixture<PurchaseVehicleCandidateDialog>,
  selector: string,
  value: string,
): void {
  const input = host(fixture).querySelector(`${selector} input`);
  if (!(input instanceof HTMLInputElement)) throw new Error(`${selector} absent.`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

const submitButton = (
  fixture: ComponentFixture<PurchaseVehicleCandidateDialog>,
): HTMLButtonElement => {
  const button = host(fixture).querySelector<HTMLButtonElement>('button.pvc-submit');
  if (button === null) throw new Error('Bouton d’envoi absent.');
  return button;
};

async function submit(fixture: ComponentFixture<PurchaseVehicleCandidateDialog>): Promise<void> {
  submitButton(fixture).click();
  await fixture.whenStable();
  fixture.detectChanges();
}

function fillFloor(fixture: ComponentFixture<PurchaseVehicleCandidateDialog>): void {
  type(fixture, '[data-name]', ' Master L3 ');
  type(fixture, '[data-cargo-length]', '370');
  type(fixture, '[data-cargo-width]', '176');
  type(fixture, '[data-cargo-height]', '189');
}

describe('PurchaseVehicleCandidateDialog', () => {
  it('ajout : envoie le prix en centimes entiers, et ferme sur un succès', async () => {
    const fixture = await boot({});
    expect(submitButton(fixture).disabled).toBe(true);
    fillFloor(fixture);
    type(fixture, '[data-price]', '32 490,9');
    type(fixture, '[data-url]', 'https://exemple.fr/master');
    await submit(fixture);

    expect(wire.adds).toEqual([
      {
        name: 'Master L3',
        cargo: { lengthCm: 370, widthCm: 176, heightCm: 189 },
        wheelArches: null,
        reference: null,
        purchaseUrl: 'https://exemple.fr/master',
        priceCentsExclVat: 3249090,
      },
    ]);
    expect(wire.closes).toEqual([true]);
  });

  it('un prix illisible bloque l’envoi et se dit', async () => {
    const fixture = await boot({});
    fillFloor(fixture);
    type(fixture, '[data-price]', '12,555');
    expect(submitButton(fixture).disabled).toBe(true);
    expect(host(fixture).querySelector('[data-issue]')?.textContent).toContain('deux décimales');
  });

  it('passages de roue à moitié saisis : refusés avant l’envoi', async () => {
    const fixture = await boot({});
    fillFloor(fixture);
    type(fixture, '[data-arch-length]', '90');
    expect(submitButton(fixture).disabled).toBe(true);
    expect(host(fixture).querySelector('[data-issue]')?.textContent).toContain('les quatre cotes');
  });

  it('🔴 un refus du serveur reste affiché, dialogue ouvert', async () => {
    const fixture = await boot({});
    wire.refuse = 'Le lien d’achat doit commencer par https://.';
    fillFloor(fixture);
    type(fixture, '[data-url]', 'http://exemple.fr');
    await submit(fixture);

    expect(host(fixture).querySelector('[data-refusal]')?.textContent).toContain('https://');
    expect(wire.closes).toEqual([]);
  });

  it('correction : part du candidat (« 12,50 »), et n’écrit rien tant que rien ne change', async () => {
    const fixture = await boot({ candidate: TRAFIC });
    expect(host(fixture).querySelector<HTMLInputElement>('[data-price] input')?.value).toBe(
      '12,50',
    );
    expect(submitButton(fixture).disabled).toBe(true);

    type(fixture, '[data-price]', '12,5');
    expect(submitButton(fixture).disabled).toBe(true);

    type(fixture, '[data-price]', '');
    await submit(fixture);
    expect(wire.updates).toEqual([
      {
        id: 'pv_1',
        payload: {
          name: 'Trafic',
          cargo: { lengthCm: 250, widthCm: 170, heightCm: 130 },
          wheelArches: null,
          reference: null,
          purchaseUrl: null,
          priceCentsExclVat: null,
        },
      },
    ]);
  });
});
