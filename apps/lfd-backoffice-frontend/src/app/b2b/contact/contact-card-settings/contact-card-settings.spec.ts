import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DEFAULT_CONTACT_SETTINGS,
  type ContactSettingsPayload,
  type ContactPhoneView,
  type ContactSettingsView,
  type StaffPermission,
} from '@lfd/contracts';

import { PermissionsStore } from '../../../auth/permissions.store';
import { describe, expect, it } from 'vitest';

import { ContactService } from '../contact.service';
import { ContactCardSettings } from './contact-card-settings';

/** La carte de contact : le réglage part entier, rogné, et seulement s'il a changé. */

class FakeContact {
  readonly puts: ContactSettingsPayload[] = [];
  refusal: unknown = null;

  constructor(
    private current: ContactSettingsView | Error,
    readonly phoneList: ContactPhoneView[] = [],
  ) {}

  phones(): Promise<ContactPhoneView[]> {
    return Promise.resolve(this.phoneList);
  }

  settings(): Promise<ContactSettingsView> {
    return this.current instanceof Error
      ? Promise.reject(this.current)
      : Promise.resolve(this.current);
  }

  updateSettings(payload: ContactSettingsPayload): Promise<void> {
    this.puts.push(payload);
    if (this.refusal !== null) return Promise.reject(this.refusal);
    this.current = { ...payload, updatedAt: '2026-10-09T08:00:00.000Z', updatedBy: 'Hugo' };
    return Promise.resolve();
  }
}

function phone(
  id: string,
  fr: string,
  number: string,
  audience: ContactPhoneView['audience'],
  position: number,
  active = true,
  en = '',
): ContactPhoneView {
  return { id, label: { fr, en, it: '' }, number, audience, position, active };
}

const PHONES: ContactPhoneView[] = [
  phone('p3', 'Masqué', '00', 'both', 0, false),
  phone('p2', 'Service pro', '04 79 99 99 99', 'b2b', 2),
  phone('p1', 'Boutique', '04 79 11 22 33', 'both', 1, true, 'Shop'),
];

async function mount(
  api: FakeContact,
  canWrite = true,
): Promise<ComponentFixture<ContactCardSettings>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ContactCardSettings],
    providers: [
      { provide: ContactService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: {
          can: (p: StaffPermission) =>
            p === 'b2b_contact:read' || (canWrite && p === 'b2b_contact:write'),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ContactCardSettings);
  fixture.detectChanges();
  // Deux lectures en parallèle (carte et numéros) : laisser la file se vider.
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<ContactCardSettings>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const save = (fixture: ComponentFixture<ContactCardSettings>): HTMLButtonElement | null =>
  host(fixture).querySelector<HTMLButtonElement>('button[data-save-card]');

function type(
  fixture: ComponentFixture<ContactCardSettings>,
  selector: string,
  value: string,
): void {
  const input = host(fixture).querySelector(selector);
  if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) {
    throw new Error(`Champ ${selector} absent.`);
  }
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('ContactCardSettings', () => {
  it('n’offre Enregistrer qu’après un changement, puis envoie le réglage entier, rogné', async () => {
    const api = new FakeContact(DEFAULT_CONTACT_SETTINGS);
    const fixture = await mount(api);
    expect(save(fixture)?.disabled).toBe(true);

    fixture.componentInstance['selectAudience']('b2c');
    fixture.detectChanges();
    type(fixture, '[data-card="b2c"] [data-title] input', ' Une question ? ');
    save(fixture)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.puts).toEqual([
      {
        cards: {
          b2b: DEFAULT_CONTACT_SETTINGS.cards.b2b,
          b2c: {
            ...DEFAULT_CONTACT_SETTINGS.cards.b2c,
            title: { fr: 'Une question ?', en: '', it: '' },
          },
        },
      },
    ]);
    expect(host(fixture).textContent).toContain('Dernier réglage par Hugo.');
    expect(save(fixture)?.disabled).toBe(true);
  });

  it('🔴 un refus du serveur s’affiche, la saisie reste', async () => {
    const api = new FakeContact(DEFAULT_CONTACT_SETTINGS);
    api.refusal = new HttpErrorResponse({ status: 400, error: { message: 'Titre refusé.' } });
    const fixture = await mount(api);
    type(fixture, '[data-title] input', 'Allô');
    save(fixture)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host(fixture).querySelector('fold-callout[announce]')?.textContent).toContain(
      'Titre refusé.',
    );
    expect(fixture.componentInstance['draft']()?.cards.b2b.title.fr).toBe('Allô');
  });

  it('l’aperçu suit la clientèle et la langue, et retombe sur le texte de la boutique', async () => {
    const view: ContactSettingsView = {
      ...DEFAULT_CONTACT_SETTINGS,
      cards: {
        ...DEFAULT_CONTACT_SETTINGS.cards,
        b2b: {
          kicker: { fr: '', en: 'Hello', it: '' },
          title: { fr: 'Un souci ?', en: '', it: '' },
          body: { fr: '', en: '', it: '' },
        },
      },
    };
    const fixture = await mount(new FakeContact(view, PHONES));
    const preview = () => fixture.componentInstance['preview']();

    expect(preview()).toMatchObject({
      // Aucun surtitre réglé en français : aucun affiché.
      kicker: '',
      title: 'Un souci ?',
      // Les numéros actifs des pros, `both` compris, par rang ; le masqué n'y est pas.
      calls: ['Appeler · Boutique · 04 79 11 22 33', 'Appeler · Service pro · 04 79 99 99 99'],
    });
    expect(preview()?.body).toBe('Nos équipes commerciales sont à votre écoute');

    fixture.componentInstance['selectLang']('en');
    // L'anglais vide : le français réglé, comme la boutique.
    // Le surtitre réglé en anglais l'emporte ; vide en français, la boutique garde le sien.
    expect(preview()).toMatchObject({ kicker: 'Hello', title: 'Un souci ?', write: 'Write' });

    fixture.componentInstance['selectAudience']('b2c');
    expect(preview()).toMatchObject({
      kicker: '',
      title: 'Contact us',
      body: 'We reply as soon as we can',
      calls: ['Call · Shop · 04 79 11 22 33'],
    });
    fixture.detectChanges();
    expect(host(fixture).querySelector('[data-preview-title]')?.textContent).toContain(
      'Contact us',
    );
  });

  it('sans numéro réglé, l’aperçu montre celui de la boutique', async () => {
    const fixture = await mount(new FakeContact(DEFAULT_CONTACT_SETTINGS));
    expect(fixture.componentInstance['preview']()?.calls).toEqual(['Appeler · +33 4 79 06 12 40']);
  });

  it('la bascule de langue signale ce qui n’est pas écrit', async () => {
    const fixture = await mount(new FakeContact(DEFAULT_CONTACT_SETTINGS));
    type(fixture, '[data-kicker] input', 'Surtitre');
    type(fixture, '[data-title] input', 'Titre');
    type(fixture, '[data-body] textarea', 'Phrase');
    const dots = fixture.componentInstance['langOptions']().map((o) => o.dot);

    expect(dots).toEqual([undefined, 'warning', 'warning']);
  });

  it('un échec de lecture se dit en état d’erreur fold', async () => {
    const fixture = await mount(new FakeContact(new Error('indisponible')));
    expect(host(fixture).querySelector('fold-empty-state')?.textContent).toContain(
      'Impossible de charger la carte de contact',
    );
  });

  it('sans le droit d’écrire : pas de bouton Enregistrer', async () => {
    const fixture = await mount(new FakeContact(DEFAULT_CONTACT_SETTINGS), false);
    expect(save(fixture)).toBeNull();
  });
});
