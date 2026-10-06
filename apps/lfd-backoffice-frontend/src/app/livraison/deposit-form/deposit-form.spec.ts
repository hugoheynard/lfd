import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { fixedGeolocation } from '../gesture-position.fixture';
import { GesturePositionReader } from '../gesture-position';
import { type DoorstepDeposit, MyDeliveryRoundService } from '../my-delivery-round.service';
import { DepositForm } from './deposit-form';

interface Wire {
  readonly sent: { readonly stopId: string; readonly deposit: DoorstepDeposit }[];
  refuse: HttpErrorResponse | null;
  deposited: number;
}

const PHOTO = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'depot.jpg', { type: 'image/jpeg' });

async function boot(): Promise<{ fixture: ComponentFixture<DepositForm>; wire: Wire }> {
  const wire: Wire = { sent: [], refuse: null, deposited: 0 };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: MyDeliveryRoundService,
        useValue: {
          deposit: (_roundId: string, stopId: string, deposit: DoorstepDeposit) => {
            wire.sent.push({ stopId, deposit });
            return wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
          },
        } satisfies Partial<Record<keyof MyDeliveryRoundService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(DepositForm);
  fixture.componentRef.setInput('roundId', 'r-1');
  fixture.componentRef.setInput('stopId', 's-1');
  fixture.componentRef.setInput('version', 7);
  fixture.componentInstance.deposited.subscribe(() => (wire.deposited += 1));
  await settle(fixture);
  return { fixture, wire };
}

async function settle(fixture: ComponentFixture<DepositForm>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function element(fixture: ComponentFixture<DepositForm>, selector: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
}

function sendButton(fixture: ComponentFixture<DepositForm>): HTMLButtonElement {
  const button = element(fixture, '[data-send-deposit]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('bouton introuvable');
  }
  return button;
}

/** La photo « prise » : le champ natif annonce un fichier, puis change. */
async function takePhoto(fixture: ComponentFixture<DepositForm>): Promise<void> {
  const input = element(fixture, '[data-handover-photo-input]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('champ photo introuvable');
  }
  Object.defineProperty(input, 'files', { value: { item: () => PHOTO }, configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle(fixture);
}

describe('DepositForm — « Déposé avec preuve » (B2)', () => {
  it('n’envoie qu’avec la photo, et ne demande ni nom ni signature', async () => {
    const { fixture } = await boot();
    expect(sendButton(fixture).disabled).toBe(true);
    expect(element(fixture, '[data-receiver-name]')).toBeNull();
    expect(element(fixture, '[data-signature-surface]')).toBeNull();

    await takePhoto(fixture);

    expect(sendButton(fixture).disabled).toBe(false);
  });

  it('envoie la photo et la version lue ; puis annonce le dépôt', async () => {
    const { fixture, wire } = await boot();
    await takePhoto(fixture);

    sendButton(fixture).click();
    await settle(fixture);

    // Sans géolocalisation (le navigateur de test n'en a pas) : partie sans position.
    expect(wire.sent).toEqual([
      { stopId: 's-1', deposit: { version: 7, photo: PHOTO, position: null } },
    ]);
    expect(wire.deposited).toBe(1);
  });

  it('YA-D4 : relève la position du téléphone AU GESTE et l’envoie avec le dépôt', async () => {
    const { fixture, wire } = await boot();
    TestBed.inject(GesturePositionReader).source = fixedGeolocation(45.46, 6.9, 12);
    await takePhoto(fixture);

    sendButton(fixture).click();
    await settle(fixture);

    expect(wire.sent[0]?.deposit.position).toEqual({
      positionLat: 45.46,
      positionLng: 6.9,
      positionAccuracyM: 12,
    });
  });

  it('un refus du serveur s’affiche tel quel, et le formulaire reste ouvert', async () => {
    const { fixture, wire } = await boot();
    const message = 'L’adresse de la commande CMD-1 n’autorise pas le dépôt sans personne.';
    wire.refuse = new HttpErrorResponse({ status: 409, error: { message } });
    await takePhoto(fixture);

    sendButton(fixture).click();
    await settle(fixture);

    expect(element(fixture, '[data-deposit-refusal]')?.textContent).toContain(message);
    expect(wire.deposited).toBe(0);
  });
});
