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

const PHOTO = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'commande-deposee.jpg', {
  type: 'image/jpeg',
});
const SLIP = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'bon-signe.jpg', {
  type: 'image/jpeg',
});
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

/** Une photo « prise » : le champ natif (sous `scope`) annonce un fichier, puis change. */
async function takePhoto(
  fixture: ComponentFixture<HandoverForm>,
  file: File = PHOTO,
  scope = '',
): Promise<void> {
  const input = element(fixture, `${scope} [data-handover-photo-input]`.trim());
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('champ photo introuvable');
  }
  Object.defineProperty(input, 'files', { value: { item: () => file }, configurable: true });
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

async function sign(fixture: ComponentFixture<HandoverForm>): Promise<void> {
  (
    fixture.debugElement.query(By.directive(SignaturePad)).componentInstance as SignaturePad
  ).signed.emit(INK);
  await settle(fixture);
}

describe('HandoverForm — « Commande déposée » (B1)', () => {
  /** Hugo, 2026-10-25 (« SARL Salon Olympique ») : sans signature exigée, ni nom ni cadre. */
  it('sans signature exigée : ni nom, ni cadre, ni bon — la photo seule suffit', async () => {
    const { fixture, wire } = await boot();
    expect(element(fixture, '[data-receiver-name]')).toBeNull();
    expect(element(fixture, '[data-signature-surface]')).toBeNull();
    expect(element(fixture, '[data-signed-slip]')).toBeNull();
    expect(sendButton(fixture).disabled).toBe(true);

    await takePhoto(fixture);
    sendButton(fixture).click();
    await settle(fixture);

    expect(wire.sent).toEqual([
      {
        stopId: 's-1',
        handover: {
          version: 7,
          receiverName: '',
          photo: PHOTO,
          signature: null,
          signedSlip: null,
          position: null,
        },
      },
    ]);
    expect(wire.handedOver).toBe(1);
  });

  it('dit « Prendre en photo la commande déposée » et « Valider la livraison »', async () => {
    const { fixture } = await boot();

    expect(sendButton(fixture).textContent).toContain('Valider la livraison');
    expect(element(fixture, '[data-handover-photo]')?.textContent).toContain(
      'Prendre en photo la commande déposée',
    );
  });

  it('signature exigée : rien ne part sans le nom, le tracé ET la photo du bon signé', async () => {
    const { fixture, wire } = await boot(true);
    expect(element(fixture, '[data-signed-slip] [data-handover-photo]')?.textContent).toContain(
      'Prendre en photo le bon signé',
    );
    await takePhoto(fixture);
    await typeName(fixture, 'A');
    await sign(fixture);
    await takePhoto(fixture, SLIP, '[data-signed-slip]');
    expect(sendButton(fixture).disabled).toBe(true);

    await typeName(fixture, '  Mme Durand ');
    expect(sendButton(fixture).disabled).toBe(false);
    sendButton(fixture).click();
    await settle(fixture);

    expect(wire.sent[0]?.handover).toMatchObject({
      receiverName: 'Mme Durand',
      photo: PHOTO,
      signature: INK,
      signedSlip: SLIP,
    });
  });

  it('signature exigée, sans photo du bon : le bouton reste fermé', async () => {
    const { fixture } = await boot(true);
    await takePhoto(fixture);
    await typeName(fixture, 'Mme Durand');
    await sign(fixture);

    expect(sendButton(fixture).disabled).toBe(true);
  });

  it('un refus du serveur s’affiche tel quel, et le formulaire reste ouvert', async () => {
    const { fixture, wire } = await boot();
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Cette commande est annulée.' },
    });
    await takePhoto(fixture);

    sendButton(fixture).click();
    await settle(fixture);

    expect(element(fixture, '[data-handover-refusal]')?.textContent).toContain(
      'Cette commande est annulée.',
    );
    expect(wire.handedOver).toBe(0);
  });
});
