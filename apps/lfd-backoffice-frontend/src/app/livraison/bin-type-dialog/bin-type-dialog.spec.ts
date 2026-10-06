import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { BinTypePayload, BinTypeView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { DeliveryBinsService } from '../delivery-bins.service';
import { BinTypeDialog, type BinTypeDialogData } from './bin-type-dialog';

interface Wire {
  adds: BinTypePayload[];
  updates: { id: string; payload: BinTypePayload }[];
  closes: unknown[];
  refuse: string | null;
}

let wire: Wire;

const BAC_M: BinTypeView = {
  id: 'bin_m',
  name: 'Bac M',
  outer: { lengthMm: 600, widthMm: 400, heightMm: 300 },
  inner: { lengthMm: 560, widthMm: 360, heightMm: 270 },
  innerVolumeLiters: 54,
  isotherm: false,
  maxStack: 5,
  divisible: false,
  archivedAt: null,
};

function write(): Promise<void> {
  return wire.refuse === null
    ? Promise.resolve()
    : Promise.reject(new HttpErrorResponse({ status: 400, error: { message: wire.refuse } }));
}

async function boot(data: BinTypeDialogData): Promise<ComponentFixture<BinTypeDialog>> {
  wire = { adds: [], updates: [], closes: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BinTypeDialog],
    providers: [
      {
        provide: DeliveryBinsService,
        useValue: {
          addBinType: (payload: BinTypePayload) => {
            wire.adds.push(payload);
            return write();
          },
          updateBinType: (id: string, payload: BinTypePayload) => {
            wire.updates.push({ id, payload });
            return write();
          },
        } satisfies Pick<DeliveryBinsService, 'addBinType' | 'updateBinType'>,
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(BinTypeDialog);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<BinTypeDialog>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function submitButton(fixture: ComponentFixture<BinTypeDialog>): HTMLButtonElement {
  const button = host(fixture).querySelector<HTMLButtonElement>('button[data-submit]');
  if (button === null) throw new Error('Bouton d’envoi absent.');
  return button;
}

function typeName(fixture: ComponentFixture<BinTypeDialog>, value: string): void {
  const input = host(fixture).querySelector('fold-input input');
  if (!(input instanceof HTMLInputElement)) throw new Error('Champ nom absent.');
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

/** Le n-ième `fold-number-input` : 0-2 extérieur, 3-5 intérieur, 6 pile. */
function typeNumber(fixture: ComponentFixture<BinTypeDialog>, index: number, value: string): void {
  const input = host(fixture).querySelectorAll('fold-number-input input')[index];
  if (!(input instanceof HTMLInputElement)) throw new Error('Champ numérique absent.');
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function check(fixture: ComponentFixture<BinTypeDialog>, selector: string): void {
  const input = host(fixture).querySelector(`${selector} input`);
  if (!(input instanceof HTMLInputElement)) throw new Error(`${selector} absent.`);
  input.click();
  fixture.detectChanges();
}

async function submit(fixture: ComponentFixture<BinTypeDialog>): Promise<void> {
  submitButton(fixture).click();
  await fixture.whenStable();
  fixture.detectChanges();
}

function fill(fixture: ComponentFixture<BinTypeDialog>, values: readonly string[]): void {
  values.forEach((value, index) => typeNumber(fixture, index, value));
}

describe('BinTypeDialog', () => {
  it('ajoute un type complet, et se ferme sur le succès', async () => {
    const fixture = await boot({});
    typeName(fixture, 'Bac froid');
    fill(fixture, ['60', '40', '30', '56', '36', '27', '4']);
    check(fixture, '[data-isotherm]');
    expect(host(fixture).querySelector('[data-volume]')?.textContent).toContain('54 L');

    await submit(fixture);
    expect(wire.adds).toEqual([
      {
        name: 'Bac froid',
        outer: { lengthMm: 600, widthMm: 400, heightMm: 300 },
        inner: { lengthMm: 560, widthMm: 360, heightMm: 270 },
        isotherm: true,
        maxStack: 4,
        divisible: false,
      },
    ]);
    expect(wire.closes).toEqual([true]);
  });

  it('saisit des centimètres à une décimale et envoie des millimètres : la manne à pain', async () => {
    const fixture = await boot({});
    typeName(fixture, 'Manne à pain');
    fill(fixture, ['66.5', '46', '71.5', '64.5', '44', '69.5', '1']);
    expect(host(fixture).querySelector('[data-volume]')?.textContent).toContain('197 L');

    await submit(fixture);
    expect(wire.adds).toEqual([
      {
        name: 'Manne à pain',
        outer: { lengthMm: 665, widthMm: 460, heightMm: 715 },
        inner: { lengthMm: 645, widthMm: 440, heightMm: 695 },
        isotherm: false,
        maxStack: 1,
        divisible: false,
      },
    ]);
  });

  it('🔴 dit qu’un intérieur dépasse l’extérieur, et n’envoie rien', async () => {
    const fixture = await boot({});
    typeName(fixture, 'Bac M');
    fill(fixture, ['60', '40', '30', '61', '36', '27', '5']);

    expect(host(fixture).querySelector('[data-issue]')?.textContent).toContain(
      'La longueur intérieure (61 cm) dépasse la longueur extérieure (60 cm).',
    );
    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('en correction, n’offre Enregistrer qu’après un changement, et écrit la fiche entière', async () => {
    const fixture = await boot({ bin: BAC_M });
    expect(submitButton(fixture).disabled).toBe(true);

    check(fixture, '[data-divisible]');
    await submit(fixture);
    expect(wire.updates).toEqual([
      {
        id: 'bin_m',
        payload: {
          name: 'Bac M',
          outer: BAC_M.outer,
          inner: BAC_M.inner,
          isotherm: false,
          maxStack: 5,
          divisible: true,
        },
      },
    ]);
  });

  it('un refus du serveur reste affiché, dialogue ouvert', async () => {
    const fixture = await boot({ bin: BAC_M });
    wire.refuse = 'Un type de bac porte déjà ce nom.';
    typeName(fixture, 'Bac L');
    await submit(fixture);

    expect(host(fixture).querySelector('[data-refusal]')?.textContent).toContain(
      'Un type de bac porte déjà ce nom.',
    );
    expect(wire.closes).toEqual([]);
  });
});
