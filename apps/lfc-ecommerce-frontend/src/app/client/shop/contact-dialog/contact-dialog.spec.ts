import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ContactMessagePayload } from '@lfd/contracts';
import type { CustomerAudience, PublicContactSubjectView } from '@lfd/contracts/shop-values';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { AuthFacade } from '../../../auth/auth.facade';
import { NotifyService } from '../../../notify.service';
import { ClientAudience } from '../../client-audience.service';
import { ClientIdentity } from '../../client-identity.service';
import { ClientLocale, type LocaleCode } from '../../client-locale.service';
import { contactDialogCopy } from '../../copy/screens/contact-dialog.copy';
import { ContactGateway } from '../contact.gateway';
import { ContactDialog } from './contact-dialog';

/**
 * **« Nous écrire »** — ce que le dialogue propose, ce qu'il pré-remplit, et ce
 * qu'il envoie (`documentation/order/plan-nous-ecrire.md`, §3 « Front »).
 */

const FR = contactDialogCopy('fr');

const SUBJECTS: PublicContactSubjectView[] = [
  { id: 's-order', label: { fr: 'Une commande', en: 'An order', it: '' } },
  { id: 's-other', label: { fr: 'Autre chose', en: '', it: '' } },
];

interface Mounted {
  readonly fixture: ComponentFixture<ContactDialog>;
  readonly asked: CustomerAudience[];
  readonly sent: ContactMessagePayload[];
  readonly closed: unknown[];
  readonly toasts: string[];
}

interface Options {
  readonly audience?: CustomerAudience;
  readonly authenticated?: boolean;
  readonly locale?: LocaleCode;
  readonly subjects?: () => Promise<PublicContactSubjectView[]>;
  readonly refusal?: string | null;
}

async function mount(options: Options = {}): Promise<Mounted> {
  const asked: CustomerAudience[] = [];
  const sent: ContactMessagePayload[] = [];
  const closed: unknown[] = [];
  const toasts: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ContactDialog],
    providers: [
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (result) => closed.push(result)) },
      {
        provide: ContactGateway,
        useValue: {
          subjects: (audience: CustomerAudience) => {
            asked.push(audience);
            return (options.subjects ?? (() => Promise.resolve(SUBJECTS)))();
          },
          send: (payload: ContactMessagePayload) => {
            sent.push(payload);
            return Promise.resolve(options.refusal ?? null);
          },
        },
      },
      { provide: NotifyService, useValue: { success: (m: string) => toasts.push(m) } },
      { provide: ClientAudience, useValue: { shown: signal(options.audience ?? 'b2c') } },
      {
        provide: AuthFacade,
        useValue: { isAuthenticated: signal(options.authenticated ?? false) },
      },
      {
        provide: ClientIdentity,
        useValue: {
          fullName: signal('Jeanne Martin'),
          email: signal('jeanne@exemple.fr'),
          phone: signal('06 12 34 56 78'),
        },
      },
    ],
  });
  TestBed.inject(ClientLocale).current.set(options.locale ?? 'fr');
  const fixture = TestBed.createComponent(ContactDialog);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, asked, sent, closed, toasts };
}

/** Les signaux protégés du dialogue, lus et écrits comme le ferait le gabarit. */
function form(fixture: ComponentFixture<ContactDialog>) {
  const dialog = fixture.componentInstance;
  return {
    options: () => dialog['subjectOptions'](),
    subjectId: dialog['subjectId'],
    name: dialog['name'],
    email: dialog['email'],
    phone: dialog['phone'],
    message: dialog['message'],
    website: dialog['website'],
    canSend: () => dialog['canSend'](),
    send: () => dialog['send'](),
  };
}

const el = (fixture: ComponentFixture<ContactDialog>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('ContactDialog', () => {
  it('🔴 ne demande que les objets du public de l’espace courant', async () => {
    const pro = await mount({ audience: 'b2b' });
    const visitor = await mount({ audience: 'b2c' });

    expect(pro.asked).toEqual(['b2b']);
    expect(visitor.asked).toEqual(['b2c']);
  });

  it('libelle les objets dans la langue de l’écran, le français à défaut', async () => {
    const { fixture } = await mount({ locale: 'en' });

    expect(form(fixture).options()).toEqual([
      { value: 's-order', label: 'An order' },
      { value: 's-other', label: 'Autre chose' },
    ]);
  });

  it('pré-remplit nom, e-mail et téléphone d’un client connecté', async () => {
    const { fixture } = await mount({ authenticated: true });
    const f = form(fixture);

    expect([f.name(), f.email(), f.phone()]).toEqual([
      'Jeanne Martin',
      'jeanne@exemple.fr',
      '06 12 34 56 78',
    ]);
  });

  it('ne pré-remplit rien pour un visiteur', async () => {
    const { fixture } = await mount();
    const f = form(fixture);

    expect([f.name(), f.email(), f.phone()]).toEqual(['', '', '']);
  });

  it('n’envoie pas sans objet, ni au-delà de la borne du message', async () => {
    const { fixture } = await mount({ authenticated: true });
    const f = form(fixture);
    f.message.set('Bonjour');
    expect(f.canSend()).toBe(false);

    f.subjectId.set('s-order');
    expect(f.canSend()).toBe(true);

    f.message.set('x'.repeat(4001));
    expect(f.canSend()).toBe(false);
  });

  it('envoie le piège et le temps écoulé, annonce, puis ferme', async () => {
    const { fixture, sent, closed, toasts } = await mount({ audience: 'b2b', authenticated: true });
    const f = form(fixture);
    f.subjectId.set('s-order');
    f.message.set('  Deux baguettes de plus  ');

    await f.send();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      subjectId: 's-order',
      audience: 'b2b',
      name: 'Jeanne Martin',
      email: 'jeanne@exemple.fr',
      phone: '06 12 34 56 78',
      message: 'Deux baguettes de plus',
      website: '',
    });
    expect(sent[0]?.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(toasts).toEqual([FR.sent]);
    expect(closed).toEqual([true]);
  });

  it('garde le refus du serveur dans le dialogue, ouvert', async () => {
    const { fixture, closed } = await mount({
      authenticated: true,
      refusal: 'Cet objet n’est plus proposé.',
    });
    const f = form(fixture);
    f.subjectId.set('s-order');
    f.message.set('Bonjour');

    await f.send();
    fixture.detectChanges();

    expect(closed).toEqual([]);
    expect(el(fixture).querySelector('fold-callout')?.textContent).toContain(
      'Cet objet n’est plus proposé.',
    );
  });

  it('dit l’échec de lecture des objets, et relit au clic', async () => {
    const subjects = vi
      .fn<() => Promise<PublicContactSubjectView[]>>()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce(SUBJECTS);
    const { fixture } = await mount({ subjects });

    const failed = el(fixture).querySelector('fold-empty-state');
    expect(failed?.textContent).toContain(FR.loadFailed);

    failed?.querySelector<HTMLButtonElement>('button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el(fixture).querySelector('fold-listbox')).not.toBeNull();
  });
});
