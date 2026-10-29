import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { ClientLocale } from '../client-locale.service';
import { ClientCopyService } from './client-copy.service';
import { FR } from './fr';
import { SHOP_COPY_STARTUP_BUDGET_MS, ShopCopyLoader } from './shop-copy-loader';
import { overlayCopy } from './shop-copy-overlay';
import { ShopCopyOverrides } from './shop-copy-overrides';

const URL = `${AUTH_CONFIG.apiBaseUrl}/shop/copy`;

describe('la superposition des textes publiés', () => {
  it('remplace une chaîne par sa clé, sans toucher au reste', () => {
    const merged = overlayCopy(FR, { 'cart.whoTitle': 'Pour qui ?' });
    expect(merged.cart.whoTitle).toBe('Pour qui ?');
    expect(merged.nav).toBe(FR.nav);
    expect(FR.cart.whoTitle).not.toBe('Pour qui ?');
  });

  it('atteint une case de tableau', () => {
    expect(overlayCopy({ list: ['a', 'b'] }, { 'list.1': 'B' }).list).toEqual(['a', 'B']);
  });

  it('ignore une clé inconnue, un objet visé, une fonction visée, un chemin trop long', () => {
    const base = { a: { b: 'x' }, f: (n: number): string => `#${n}` };
    expect(overlayCopy(base, { 'a.zz': 'y', a: 'écrasé', f: 'non', 'a.b.c': 'trop loin' })).toBe(
      base,
    );
  });

  it('rend le dictionnaire tel quel sans remplacement', () => {
    expect(overlayCopy(FR, {})).toBe(FR);
  });
});

describe('ClientCopyService et les remplacements', () => {
  it('applique ceux de la langue courante, et seulement elle — sans aucun appel réseau', async () => {
    TestBed.configureTestingModule({});
    const copy = TestBed.inject(ClientCopyService);
    TestBed.inject(ShopCopyOverrides).receive('en', { 'cart.whoTitle': 'For whom?' });

    expect(copy.t().cart.whoTitle).toBe(FR.cart.whoTitle);
    TestBed.inject(ClientLocale).current.set('en');
    TestBed.tick();
    await copy.whenReady('en');
    expect(copy.t().cart.whoTitle).toBe('For whom?');
  });

  /** Chargement à la demande (2026-10-29) : jamais un retour par le français entre deux langues. */
  it('garde la langue servie tant que la suivante n’est pas arrivée', async () => {
    TestBed.configureTestingModule({});
    const copy = TestBed.inject(ClientCopyService);
    const locale = TestBed.inject(ClientLocale);
    locale.current.set('en');
    TestBed.tick();
    await copy.whenReady('en');
    const english = copy.t().cart.whoTitle;
    expect(english).not.toBe(FR.cart.whoTitle);

    locale.current.set('it');
    TestBed.tick();
    expect(copy.t().cart.whoTitle).toBe(english);
    await copy.whenReady('it');
    expect(copy.t().cart.whoTitle).not.toBe(english);
    expect(copy.t().cart.whoTitle).not.toBe(FR.cart.whoTitle);
  });
});

describe('la lecture des textes publiés', () => {
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    backend.verify();
  });

  function answer(locale: string, texts: Record<string, string>): void {
    backend
      .expectOne((request) => request.url === URL && request.params.get('locale') === locale)
      .flush({ locale, version: 1, texts });
  }

  it('applique la réponse, une clé inconnue ignorée', async () => {
    const copy = TestBed.inject(ClientCopyService);
    const started = TestBed.inject(ShopCopyLoader).start(SHOP_COPY_STARTUP_BUDGET_MS);
    answer('fr', { 'cart.whoTitle': 'Pour qui ?', 'inconnu.cle': 'ignoré' });
    await started;
    expect(copy.t().cart.whoTitle).toBe('Pour qui ?');
  });

  it('un seul appel par langue, quel que soit le nombre de lecteurs', async () => {
    const loader = TestBed.inject(ShopCopyLoader);
    const copy = TestBed.inject(ClientCopyService);
    const started = loader.start(SHOP_COPY_STARTUP_BUDGET_MS);
    TestBed.tick();
    void loader.load('fr');
    copy.t();
    copy.t();
    answer('fr', {});
    await started;
    await loader.load('fr');
    TestBed.tick();
    backend.expectNone(URL);
  });

  it('une langue changée en cours de visite fait UN second appel, et pas plus', async () => {
    const loader = TestBed.inject(ShopCopyLoader);
    const copy = TestBed.inject(ClientCopyService);
    const locale = TestBed.inject(ClientLocale);
    void loader.start(SHOP_COPY_STARTUP_BUDGET_MS);
    TestBed.tick();
    answer('fr', {});

    locale.current.set('en');
    TestBed.tick();
    answer('en', { 'cart.whoTitle': 'For whom?' });
    await loader.load('en');
    await copy.whenReady('en');
    expect(copy.t().cart.whoTitle).toBe('For whom?');

    locale.current.set('fr');
    TestBed.tick();
    locale.current.set('en');
    TestBed.tick();
    backend.expectNone(URL);
  });

  it('attend au plus 300 ms, puis laisse démarrer avec le texte du code', async () => {
    vi.useFakeTimers();
    const overrides = TestBed.inject(ShopCopyOverrides);
    TestBed.inject(ClientLocale).current.set('it');
    let started = false;
    void TestBed.inject(ShopCopyLoader)
      .start(SHOP_COPY_STARTUP_BUDGET_MS)
      .then(() => {
        started = true;
      });
    await vi.advanceTimersByTimeAsync(SHOP_COPY_STARTUP_BUDGET_MS - 1);
    expect(started).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(started).toBe(true);
    expect(overrides.texts('it')).toEqual({});
    // La réponse tardive s'applique quand même.
    answer('it', { 'cart.whoTitle': 'Per chi?' });
    await TestBed.inject(ShopCopyLoader).load('it');
    expect(overrides.texts('it')).toEqual({ 'cart.whoTitle': 'Per chi?' });
  });

  it('une API en panne laisse le texte du code', async () => {
    const loader = TestBed.inject(ShopCopyLoader);
    const done = loader.load('fr');
    backend
      .expectOne((request) => request.url === URL)
      .flush('panne', { status: 503, statusText: 'Service Unavailable' });
    await done;
    expect(TestBed.inject(ShopCopyOverrides).texts('fr')).toEqual({});
  });
});
