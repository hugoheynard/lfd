import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FoldInputComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { type DoorstepHandover, MyDeliveryRoundService } from '../my-delivery-round.service';
import { SignaturePad } from '../signature-pad/signature-pad';
import { HandoverForm } from './handover-form';

interface Wire {
  readonly sent: { readonly stopId: string; readonly handover: DoorstepHandover }[];
  refuse: HttpErrorResponse | null;
  handedOver: number;
}

const PHOTO = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'remise.jpg', { type: 'image/jpeg' });
const INK = new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' });

async function boot(
  signatureRequired = false,
): Promise<{ fixture: ComponentFixture<HandoverForm>; wire: Wire }> {
  const wire: Wire = { sent: [], refuse: null, handedOver: 0 };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: MyDeliveryRoundService,
        useValue: {
          handOver: (_roundId: string, stopId: string, handover: DoorstepHandover) => {
            wire.sent.push({ stopId, handover });
            return wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
          },
        } satisfies Partial<Record<keyof MyDeliveryRoundService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(HandoverForm);
  fixture.componentRef.setInput('roundId', 'r-1');
  fixture.componentRef.setInput('stopId', 's-1');
  fixture.componentRef.setInput('version', 7);
  fixture.componentRef.setInput('signatureRequired', signatureRequired);
  fixture.componentInstance.handedOver.subscribe(() => (wire.handedOver += 1));
  await settle(fixture);
  return { fixture, wire };
}

async function settle(fixture: ComponentFixture<HandoverForm>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function element(fixture: ComponentFixture<HandoverForm>, selector: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
}

function sendButton(fixture: ComponentFixture<HandoverForm>): HTMLButtonElement {
  const button = element(fixture, '[data-send-handover]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('bouton introuvable');
  }
  return button;
}

/** La photo « prise » : le champ natif annonce un fichier, puis change. */
async function takePhoto(fixture: ComponentFixture<HandoverForm>): Promise<void> {
  const input = element(fixture, '[data-handover-photo-input]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('champ photo introuvable');
  }
  Object.defineProperty(input, 'files', { value: { item: () => PHOTO }, configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle(fixture);
}

async function typeName(fixture: ComponentFixture<HandoverForm>, name: string): Promise<void> {
  (
    fixture.debugElement.query(By.directive(FoldInputComponent))
      .componentInstance as FoldInputComponent
  ).value.set(name);
  await settle(fixture);
}

describe('HandoverForm — « Remis au client » (B1)', () => {
  it('n’envoie qu’avec la photo ET un nom de 2 caractères au moins', async () => {
    const { fixture } = await boot();
    expect(sendButton(fixture).disabled).toBe(true);

    await typeName(fixture, 'A');
    await takePhoto(fixture);
    expect(sendButton(fixture).disabled).toBe(true);

    await typeName(fixture, 'Mme Durand');
    expect(sendButton(fixture).disabled).toBe(false);
  });

  it('envoie la photo, le nom rogné et la version lue ; puis annonce la remise', async () => {
    const { fixture, wire } = await boot();
    await takePhoto(fixture);
    await typeName(fixture, '  Mme Durand ');

    sendButton(fixture).click();
    await settle(fixture);

    expect(wire.sent).toEqual([
      {
        stopId: 's-1',
        handover: {
          version: 7,
          receiverName: 'Mme Durand',
          photo: PHOTO,
          signature: null,
          position: null,
        },
      },
    ]);
    expect(wire.handedOver).toBe(1);
  });

  it('signature exigée : le cadre paraît, et rien ne part sans le tracé', async () => {
    const { fixture, wire } = await boot(true);
    await takePhoto(fixture);
    await typeName(fixture, 'Mme Durand');
    expect(sendButton(fixture).disabled).toBe(true);

    (
      fixture.debugElement.query(By.directive(SignaturePad)).componentInstance as SignaturePad
    ).signed.emit(INK);
    await settle(fixture);
    sendButton(fixture).click();
    await settle(fixture);

    expect(wire.sent[0]?.handover.signature).toBe(INK);
  });

  it('sans signature exigée, aucun cadre', async () => {
    const { fixture } = await boot();

    expect(element(fixture, '[data-signature-surface]')).toBeNull();
  });

  it('un refus du serveur s’affiche tel quel, et le formulaire reste ouvert', async () => {
    const { fixture, wire } = await boot();
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Cette commande est annulée.' },
    });
    await takePhoto(fixture);
    await typeName(fixture, 'Mme Durand');

    sendButton(fixture).click();
    await settle(fixture);

    expect(element(fixture, '[data-handover-refusal]')?.textContent).toContain(
      'Cette commande est annulée.',
    );
    expect(wire.handedOver).toBe(0);
  });
});
