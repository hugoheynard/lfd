import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { RequestReasonPayload, RequestReasonView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { RequestReasonsService } from '../request-reasons.service';
import { RequestReasonDialog, type RequestReasonDialogData } from './request-reason-dialog';

/** Le dialogue d'un objet de contact : saisie, refus du serveur, archivage, lecture seule. */

const ORDER: RequestReasonView = {
  kind: 'contact',
  id: 'cs_1',
  label: { fr: 'Ma commande', en: 'My order', it: '' },
  recipientEmail: 'commandes@example.fr',
  position: 2,
  active: true,
  audience: 'both',
  priority: 'medium',
};

interface Wire {
  creates: RequestReasonPayload[];
  updates: { id: string; payload: RequestReasonPayload }[];
  archives: string[];
  closes: unknown[];
  refuse: string | null;
}

let wire: Wire;

function outcome(): Promise<void> {
  return wire.refuse === null
    ? Promise.resolve()
    : Promise.reject(new HttpErrorResponse({ status: 409, error: { message: wire.refuse } }));
}

async function boot(data: RequestReasonDialogData): Promise<ComponentFixture<RequestReasonDialog>> {
  wire = { creates: [], updates: [], archives: [], closes: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [RequestReasonDialog],
    providers: [
      {
        provide: RequestReasonsService,
        useValue: {
          create: (payload: RequestReasonPayload) => {
            wire.creates.push(payload);
            return outcome();
          },
          update: (id: string, payload: RequestReasonPayload) => {
            wire.updates.push({ id, payload });
            return outcome();
          },
          archive: (id: string) => {
            wire.archives.push(id);
            return outcome();
          },
        } satisfies Pick<RequestReasonsService, 'create' | 'update' | 'archive'>,
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(RequestReasonDialog);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<RequestReasonDialog>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const submitButton = (fixture: ComponentFixture<RequestReasonDialog>): HTMLButtonElement | null =>
  host(fixture).querySelector<HTMLButtonElement>('button[data-submit]');

/** Bascule la langue du libellé, comme le ferait un clic sur FR / EN / IT. */
function lang(fixture: ComponentFixture<RequestReasonDialog>, code: 'fr' | 'en' | 'it'): void {
  fixture.componentInstance['selectLang'](code);
  fixture.detectChanges();
}

function type(fixture: ComponentFixture<RequestReasonDialog>, field: string, value: string): void {
  const input = host(fixture).querySelector(`[${field}] input`);
  if (!(input instanceof HTMLInputElement)) throw new Error(`Champ ${field} absent.`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

async function submit(fixture: ComponentFixture<RequestReasonDialog>): Promise<void> {
  submitButton(fixture)?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('RequestReasonDialog', () => {
  it('ajout : le libellé français et une adresse e-mail sont requis', async () => {
    const fixture = await boot({ kind: 'contact', nextPosition: 3, canWrite: true });
    expect(submitButton(fixture)?.disabled).toBe(true);
    expect(host(fixture).querySelector('[data-issue]')).toBeNull();

    type(fixture, 'data-label', 'Facturation');
    expect(host(fixture).querySelector('[data-issue]')?.textContent).toContain(
      "l'adresse de destination",
    );

    type(fixture, 'data-recipient', 'pas-une-adresse');
    expect(submitButton(fixture)?.disabled).toBe(true);
    expect(host(fixture).querySelector('[data-issue]')?.textContent).toContain(
      "n'est pas une adresse e-mail",
    );

    type(fixture, 'data-recipient', ' compta@example.fr ');
    expect(submitButton(fixture)?.disabled).toBe(false);
  });

  it('ajout : envoie la saisie rognée, au rang proposé, et ferme sur un succès', async () => {
    const fixture = await boot({ kind: 'contact', nextPosition: 3, canWrite: true });
    type(fixture, 'data-label', ' Facturation ');
    lang(fixture, 'en');
    type(fixture, 'data-label', 'Billing');
    type(fixture, 'data-recipient', 'compta@example.fr');
    await submit(fixture);

    expect(wire.creates).toEqual([
      {
        kind: 'contact',
        label: { fr: 'Facturation', en: 'Billing', it: '' },
        recipientEmail: 'compta@example.fr',
        position: 3,
        active: true,
        audience: 'both',
        priority: 'medium',
      },
    ]);
    expect(wire.closes).toEqual(['saved']);
  });

  it('correction : rien ne part tant que rien ne change', async () => {
    const fixture = await boot({ kind: 'contact', reason: ORDER, nextPosition: 3, canWrite: true });
    expect(submitButton(fixture)?.disabled).toBe(true);

    lang(fixture, 'it');
    type(fixture, 'data-label', 'Il mio ordine');
    await submit(fixture);

    expect(wire.updates).toEqual([
      { id: 'cs_1', payload: { ...ORDER_PAYLOAD, label: { ...ORDER.label, it: 'Il mio ordine' } } },
    ]);
  });

  it('la priorité part dans le payload, et compte comme un changement', async () => {
    const fixture = await boot({ kind: 'contact', reason: ORDER, nextPosition: 3, canWrite: true });
    fixture.componentInstance['priority'].set('urgent');
    fixture.detectChanges();
    await submit(fixture);

    expect(wire.updates).toEqual([
      { id: 'cs_1', payload: { ...ORDER_PAYLOAD, priority: 'urgent' } },
    ]);
  });

  it('le type du motif repart tel quel en correction : il ne change pas', async () => {
    const problem: RequestReasonView = { ...ORDER, kind: 'order_problem' };
    const fixture = await boot({
      kind: 'order_problem',
      reason: problem,
      nextPosition: 3,
      canWrite: true,
    });
    type(fixture, 'data-label', 'Colis abîmé');
    await submit(fixture);

    expect(wire.updates[0]?.payload.kind).toBe('order_problem');
  });

  it('🔴 un refus du serveur reste dans le dialogue, qui reste ouvert', async () => {
    const fixture = await boot({ kind: 'contact', reason: ORDER, nextPosition: 3, canWrite: true });
    wire.refuse = "L'adresse de destination n'est pas valide.";
    type(fixture, 'data-label', 'Autre');
    await submit(fixture);

    expect(host(fixture).querySelector('fold-callout[announce]')?.textContent).toContain(
      "L'adresse de destination n'est pas valide.",
    );
    expect(wire.closes).toEqual([]);
  });

  it('la bascule signale les langues manquantes, et l’aperçu suit la langue choisie', async () => {
    const fixture = await boot({ kind: 'contact', reason: ORDER, nextPosition: 3, canWrite: true });
    const dots = (): Record<string, string | undefined> =>
      Object.fromEntries(fixture.componentInstance['langOptions']().map((o) => [o.value, o.dot]));
    expect(dots()).toEqual({ fr: undefined, en: undefined, it: 'warning' });

    lang(fixture, 'it');
    // L'italien vide : la boutique montre le français.
    expect(fixture.componentInstance['previewOptions']()[0]?.label).toBe('Ma commande');
    expect(fixture.componentInstance['previewWord']()).toBe('Motivo');
    lang(fixture, 'en');
    expect(fixture.componentInstance['previewOptions']()[0]?.label).toBe('My order');

    lang(fixture, 'fr');
    type(fixture, 'data-label', '');
    expect(dots()['fr']).toBe('alert');
  });

  it('archive depuis la zone de danger, en correction seulement', async () => {
    const create = await boot({ kind: 'contact', nextPosition: 0, canWrite: true });
    expect(host(create).querySelector('fold-danger-zone')).toBeNull();

    const fixture = await boot({ kind: 'contact', reason: ORDER, nextPosition: 3, canWrite: true });
    expect(host(fixture).querySelector('fold-danger-zone')).not.toBeNull();
    await fixture.componentInstance['archive']();

    expect(wire.archives).toEqual(['cs_1']);
    expect(wire.closes).toEqual(['archived']);
  });

  it('sans le droit d’écrire : ni Enregistrer, ni archivage', async () => {
    const fixture = await boot({
      kind: 'contact',
      reason: ORDER,
      nextPosition: 3,
      canWrite: false,
    });

    expect(submitButton(fixture)).toBeNull();
    expect(host(fixture).querySelector('fold-danger-zone')).toBeNull();
    await fixture.componentInstance['archive']();
    expect(wire.archives).toEqual([]);
  });
});

const ORDER_PAYLOAD: RequestReasonPayload = {
  kind: 'contact',
  label: ORDER.label,
  recipientEmail: ORDER.recipientEmail,
  position: ORDER.position,
  active: ORDER.active,
  audience: ORDER.audience,
  priority: ORDER.priority,
};
