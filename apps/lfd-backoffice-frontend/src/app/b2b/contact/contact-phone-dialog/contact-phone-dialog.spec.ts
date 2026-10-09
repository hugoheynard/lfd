import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ContactPhonePayload, ContactPhoneView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ContactService } from '../contact.service';
import { ContactPhoneDialog, type ContactPhoneDialogData } from './contact-phone-dialog';

/** Le dialogue d'un numéro : saisie par langue, refus du serveur, archivage, lecture seule. */

const SHOP: ContactPhoneView = {
  id: 'ph_1',
  label: { fr: 'Boutique', en: 'Shop', it: '' },
  number: '+33 4 79 06 12 40',
  audience: 'both',
  position: 1,
  active: true,
};

const SHOP_PAYLOAD: ContactPhonePayload = {
  label: SHOP.label,
  number: SHOP.number,
  audience: SHOP.audience,
  position: SHOP.position,
  active: SHOP.active,
};

interface Wire {
  creates: ContactPhonePayload[];
  updates: { id: string; payload: ContactPhonePayload }[];
  archives: string[];
  closes: unknown[];
  refuse: string | null;
}

let wire: Wire;

function outcome(): Promise<void> {
  return wire.refuse === null
    ? Promise.resolve()
    : Promise.reject(new HttpErrorResponse({ status: 400, error: { message: wire.refuse } }));
}

async function boot(data: ContactPhoneDialogData): Promise<ComponentFixture<ContactPhoneDialog>> {
  wire = { creates: [], updates: [], archives: [], closes: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ContactPhoneDialog],
    providers: [
      {
        provide: ContactService,
        useValue: {
          createPhone: (payload: ContactPhonePayload) => {
            wire.creates.push(payload);
            return outcome();
          },
          updatePhone: (id: string, payload: ContactPhonePayload) => {
            wire.updates.push({ id, payload });
            return outcome();
          },
          archivePhone: (id: string) => {
            wire.archives.push(id);
            return outcome();
          },
        } satisfies Pick<ContactService, 'createPhone' | 'updatePhone' | 'archivePhone'>,
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(ContactPhoneDialog);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<ContactPhoneDialog>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const submitButton = (fixture: ComponentFixture<ContactPhoneDialog>): HTMLButtonElement | null =>
  host(fixture).querySelector<HTMLButtonElement>('button[data-submit]');

function lang(fixture: ComponentFixture<ContactPhoneDialog>, code: 'fr' | 'en' | 'it'): void {
  fixture.componentInstance['selectLang'](code);
  fixture.detectChanges();
}

function type(fixture: ComponentFixture<ContactPhoneDialog>, field: string, value: string): void {
  const input = host(fixture).querySelector(`[${field}] input`);
  if (!(input instanceof HTMLInputElement)) throw new Error(`Champ ${field} absent.`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

async function submit(fixture: ComponentFixture<ContactPhoneDialog>): Promise<void> {
  submitButton(fixture)?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('ContactPhoneDialog', () => {
  it('ajout : libellé français et numéro requis, puis envoi rogné au rang proposé', async () => {
    const fixture = await boot({ nextPosition: 4, canWrite: true });
    expect(submitButton(fixture)?.disabled).toBe(true);

    type(fixture, 'data-label', ' Service commercial ');
    expect(host(fixture).querySelector('[data-issue]')?.textContent).toContain('le numéro');
    type(fixture, 'data-number', ' 04 79 00 00 00 ');
    lang(fixture, 'it');
    type(fixture, 'data-label', 'Servizio commerciale');
    await submit(fixture);

    expect(wire.creates).toEqual([
      {
        label: { fr: 'Service commercial', en: '', it: 'Servizio commerciale' },
        number: '04 79 00 00 00',
        audience: 'both',
        position: 4,
        active: true,
      },
    ]);
    expect(wire.closes).toEqual(['saved']);
  });

  it('la bascule signale les langues manquantes', async () => {
    const fixture = await boot({ phone: SHOP, nextPosition: 2, canWrite: true });
    const dots = () => fixture.componentInstance['langOptions']().map((o) => o.dot);
    expect(dots()).toEqual([undefined, undefined, 'warning']);

    type(fixture, 'data-label', '');
    expect(dots()[0]).toBe('alert');
  });

  it('correction : rien ne part tant que rien ne change', async () => {
    const fixture = await boot({ phone: SHOP, nextPosition: 2, canWrite: true });
    expect(submitButton(fixture)?.disabled).toBe(true);

    fixture.componentInstance['audience'].set('b2c');
    fixture.detectChanges();
    await submit(fixture);
    expect(wire.updates).toEqual([{ id: 'ph_1', payload: { ...SHOP_PAYLOAD, audience: 'b2c' } }]);
  });

  it('🔴 un refus du serveur reste dans le dialogue, qui reste ouvert', async () => {
    const fixture = await boot({ phone: SHOP, nextPosition: 2, canWrite: true });
    wire.refuse = 'Numéro refusé : trop de caractères.';
    type(fixture, 'data-number', '0479');
    await submit(fixture);

    expect(host(fixture).querySelector('fold-callout[announce]')?.textContent).toContain(
      'Numéro refusé',
    );
    expect(wire.closes).toEqual([]);
  });

  it('archive depuis la zone de danger ; rien de tel en lecture seule', async () => {
    const fixture = await boot({ phone: SHOP, nextPosition: 2, canWrite: true });
    await fixture.componentInstance['archive']();
    expect(wire.archives).toEqual(['ph_1']);
    expect(wire.closes).toEqual(['archived']);

    const readOnly = await boot({ phone: SHOP, nextPosition: 2, canWrite: false });
    expect(submitButton(readOnly)).toBeNull();
    expect(host(readOnly).querySelector('fold-danger-zone')).toBeNull();
  });
});
