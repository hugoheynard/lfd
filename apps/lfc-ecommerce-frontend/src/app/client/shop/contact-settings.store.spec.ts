import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AudienceContactSettingsView } from '@lfd/contracts/shop-values';
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from '../client-workspace.fixture';
import {
  contactFor,
  ContactSettingsStore,
  NO_CONTACT_SETTINGS,
  phonesFor,
} from './contact-settings.store';

const label = (fr: string, en = '') => ({ fr, en, it: '' });

/** Une carte servie : ses numéros, déjà ceux de son audience (`both` compris). */
const SETTINGS: AudienceContactSettingsView = {
  ...NO_CONTACT_SETTINGS,
  phones: [
    { label: label('Service commercial', 'Sales'), number: '04 79 00 00 01', audience: 'b2b' },
    { label: label('Boutique'), number: '04 79 00 00 02', audience: 'both' },
  ],
};

describe('phonesFor', () => {
  it('garde `both` et le public de l’écran, dans l’ordre, libellé dans la langue (fr à défaut)', () => {
    expect(phonesFor(SETTINGS, 'en')).toEqual([
      { label: 'Sales', number: '04 79 00 00 01' },
      { label: 'Boutique', number: '04 79 00 00 02' },
    ]);
  });

  /**
   * Régression : aucun numéro réglé faisait afficher un numéro de repli
   * inventé, en production (retiré le 2026-10-26, décision de Hugo).
   */
  it('aucun numéro réglé → aucun numéro, jamais un repli', () => {
    expect(phonesFor(NO_CONTACT_SETTINGS, 'fr')).toEqual([]);
  });

  it('carte qui coupe le numéro → aucun numéro, même servi', () => {
    expect(phonesFor({ ...SETTINGS, card: { ...SETTINGS.card, showPhone: false } }, 'fr')).toEqual(
      [],
    );
  });
});

describe('contactFor — la carte selon ses deux interrupteurs (Hugo, 2026-10-26)', () => {
  const WORDS = { call: 'Appeler', write: 'Écrire' };
  const withCard = (
    card: Partial<AudienceContactSettingsView['card']>,
  ): AudienceContactSettingsView => ({ ...SETTINGS, card: { ...SETTINGS.card, ...card } });
  const SOON = { fr: 'Nous vous contacterons bientôt', en: 'We will contact you soon', it: '' };

  it('numéro et formulaire : les deux, aux mots du dictionnaire, sans message', () => {
    expect(contactFor(withCard({ noContactMessage: SOON }), 'fr', WORDS)).toEqual({
      phones: [
        { label: 'Service commercial', number: '04 79 00 00 01' },
        { label: 'Boutique', number: '04 79 00 00 02' },
      ],
      call: 'Appeler',
      write: 'Écrire',
      canWrite: true,
      noContact: '',
    });
  });

  it('numéro coupé, formulaire affiché : aucun numéro, « Écrire » reste', () => {
    const shown = contactFor(withCard({ showPhone: false }), 'fr', WORDS);
    expect(shown).toMatchObject({ phones: [], canWrite: true, noContact: '' });
  });

  it('ni numéro ni formulaire : le message réglé, dans la langue (fr à défaut)', () => {
    const silent = withCard({ showPhone: false, showForm: false, noContactMessage: SOON });
    expect(contactFor(silent, 'en', WORDS)).toMatchObject({
      phones: [],
      canWrite: false,
      noContact: 'We will contact you soon',
    });
    expect(contactFor(silent, 'it', WORDS).noContact).toBe('Nous vous contacterons bientôt');
  });

  it('les mots des boutons réglés l’emportent sur le dictionnaire', () => {
    const shown = contactFor(
      withCard({
        callLabel: { fr: 'Nous appeler', en: '', it: '' },
        writeLabel: { fr: '', en: 'Email us', it: '' },
      }),
      'en',
      WORDS,
    );
    expect(shown).toMatchObject({ call: 'Nous appeler', write: 'Email us' });
  });
});

/**
 * Hugo, 2026-11-01 : chaque audience ne reçoit que sa carte. Un visiteur lit
 * la route publique (la vitrine pro y ajoute `?audience=pro`) ; un client
 * connecté lit `/me/contact-settings`, relue — et vidée d'abord — quand il
 * change d'espace.
 */
describe('ContactSettingsStore — la carte, par lecteur', () => {
  const url = (path: string) => (request: { url: string }) => request.url.endsWith(path);
  const PROS = { ...SETTINGS, card: { ...SETTINGS.card, title: label('Carte pros') } };
  const flushed = () => new Promise((resolve) => setTimeout(resolve, 0));

  function boot(authenticated: boolean, workspace: WorkspaceDouble = workspaceDouble()) {
    const signedIn = signal(authenticated);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideWorkspace(workspace),
        {
          provide: AuthFacade,
          useValue: { isAuthenticated: signedIn, accessToken$: () => of('jeton') },
        },
      ],
    });
    return {
      store: TestBed.inject(ContactSettingsStore),
      http: TestBed.inject(HttpTestingController),
      signedIn,
    };
  }

  it('un visiteur lit la carte des particuliers, sans jeton', async () => {
    const { store, http } = boot(false);
    const hydrating = store.hydrate();
    const request = http.expectOne(url('/contact-settings'));
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(SETTINGS);
    await hydrating;

    expect(store.settings()).toEqual(SETTINGS);
    http.verify();
  });

  it('la vitrine pro lit la carte des pros par `?audience=pro`', async () => {
    const { store, http } = boot(false);
    const hydrating = store.hydrate('pro');
    http.expectOne(url('/contact-settings?audience=pro')).flush(PROS);
    await hydrating;

    expect(store.settings().card.title.fr).toBe('Carte pros');
    http.verify();
  });

  it('un client connecté lit la sienne, avec son jeton, quelle que soit la vitrine', async () => {
    const { store, http } = boot(true);
    const hydrating = store.hydrate('pro');
    const request = http.expectOne(url('/me/contact-settings'));
    expect(request.request.headers.get('Authorization')).toBe('Bearer jeton');
    request.flush(SETTINGS);
    await hydrating;

    expect(store.settings()).toEqual(SETTINGS);
    http.verify();
  });

  /**
   * Une audience, une information (2026-11-01) : la carte de l'ancien lecteur
   * ne se montre pas au nouveau — ni pendant la relecture, ni après son échec.
   */
  it('se vide au changement d’espace, et reste vide si la relecture échoue', async () => {
    const workspace = workspaceDouble();
    const { store, http } = boot(true, workspace);
    const hydrating = store.hydrate();
    http.expectOne(url('/me/contact-settings')).flush(PROS);
    await hydrating;

    workspace.choose('cmp_pro');
    TestBed.tick();
    expect(store.settings()).toEqual(NO_CONTACT_SETTINGS);
    http
      .expectOne(url('/me/contact-settings'))
      .flush('panne', { status: 500, statusText: 'Server Error' });
    await flushed();

    expect(store.settings()).toEqual(NO_CONTACT_SETTINGS);
    http.verify();
  });

  /**
   * Lot d (brique par clé de contexte) : pendant une bascule, la carte de
   * l'espace demandé part d'avance, avec SON en-tête, et ne s'affiche qu'une
   * fois l'espace accepté ; rien de l'ancien espace n'est rendu ensuite.
   */
  it('rien de l’ancien espace n’est rendu après une bascule', async () => {
    const workspace = workspaceDouble();
    const { store, http } = boot(true, workspace);
    const hydrating = store.hydrate();
    http.expectOne(url('/me/contact-settings')).flush(PROS);
    await hydrating;

    workspace.switching.set({ from: workspace.current() ?? null, to: 'cmp_b' });
    workspace.current.set('cmp_b');
    TestBed.tick();
    const ahead = http.expectOne(url('/me/contact-settings'));
    expect(ahead.request.headers.get(WORKSPACE_HEADER)).toBe('cmp_b');
    expect(store.settings()).toEqual(PROS);
    ahead.flush(SETTINGS);
    await flushed();

    workspace.switching.set(null);
    TestBed.tick();
    expect(store.settings()).toEqual(SETTINGS);
    http.verify();
  });

  it('à la déconnexion, relit la route publique et ne garde rien du compte', async () => {
    const { store, http, signedIn } = boot(true);
    const hydrating = store.hydrate();
    http.expectOne(url('/me/contact-settings')).flush(PROS);
    await hydrating;

    signedIn.set(false);
    TestBed.tick();
    expect(store.settings()).toEqual(NO_CONTACT_SETTINGS);
    http.expectOne(url('/contact-settings')).flush(SETTINGS);
    await flushed();

    expect(store.settings()).toEqual(SETTINGS);
    http.verify();
  });
});
