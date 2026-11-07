import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { MailEditorPhraseLocaleView, MailEditorPhraseView } from '@lfd/mail-blocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../notify.service';
import { MailEditorService } from '../data/mail-editor.service';
import { MailPhrasesStore, PHRASE_DRAFT_DEBOUNCE_MS } from './mail-phrases-store';

const TEMPLATE = 'customer.order-placed';

function locale(change: Partial<MailEditorPhraseLocaleView> = {}): MailEditorPhraseLocaleView {
  return {
    default: 'Commande {ref} payée',
    draftState: 'unchanged',
    draftText: null,
    publishedText: null,
    revision: 2,
    ...change,
  };
}

function phrase(change: Partial<MailEditorPhraseLocaleView> = {}): MailEditorPhraseView {
  return {
    path: 'title.paid',
    variables: ['ref'],
    requiredVariables: ['ref'],
    locales: { fr: locale(change), en: locale(), it: locale() },
  };
}

function setup(api: Partial<Record<keyof MailEditorService, ReturnType<typeof vi.fn>>> = {}) {
  const calls = {
    savePhraseDraft: vi.fn(() => Promise.resolve()),
    resetPhrase: vi.fn(() => Promise.resolve()),
    phrases: vi.fn(() =>
      Promise.resolve({ template: TEMPLATE, phrases: [phrase({ revision: 7 })] }),
    ),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [
      MailPhrasesStore,
      { provide: MailEditorService, useValue: calls },
      { provide: NotifyService, useValue: { error: vi.fn(), success: vi.fn() } },
    ],
  });
  const store = TestBed.inject(MailPhrasesStore);
  store.use(TEMPLATE, [phrase()]);
  return { store, calls };
}

describe('MailPhrasesStore — les phrases du modèle en brouillon', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('écrit la frappe après la pause, sur la révision lue, et la compte en attente', async () => {
    const { store, calls } = setup();
    store.edit(phrase(), 'fr', 'Commande {ref} réglée');
    expect(calls.savePhraseDraft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PHRASE_DRAFT_DEBOUNCE_MS);
    expect(calls.savePhraseDraft).toHaveBeenCalledWith(TEMPLATE, {
      path: 'title.paid',
      locale: 'fr',
      text: 'Commande {ref} réglée',
      expectedRevision: 2,
    });
    expect(store.pendingCount()).toBe(1);
    expect(store.textOf(store.phrases()[0] ?? phrase(), 'fr')).toBe('Commande {ref} réglée');
  });

  it('un refus (400) reste sous le champ, tel que le serveur le dit, et la frappe est gardée', async () => {
    const refusal = new HttpErrorResponse({
      status: 400,
      error: { message: 'La variable {ref} est obligatoire.' },
    });
    const { store } = setup({ savePhraseDraft: vi.fn(() => Promise.reject(refusal)) });
    store.edit(phrase(), 'fr', 'Commande réglée');
    await vi.advanceTimersByTimeAsync(PHRASE_DRAFT_DEBOUNCE_MS);
    expect(store.refusalOf(phrase(), 'fr')).toContain('{ref} est obligatoire');
    expect(store.textOf(phrase(), 'fr')).toBe('Commande réglée');
  });

  it('un conflit (409) abandonne la frappe, relit les phrases et le signale', async () => {
    const conflict = new HttpErrorResponse({ status: 409 });
    const { store, calls } = setup({ savePhraseDraft: vi.fn(() => Promise.reject(conflict)) });
    store.edit(phrase(), 'fr', 'Autre');
    await vi.advanceTimersByTimeAsync(PHRASE_DRAFT_DEBOUNCE_MS);
    expect(calls.phrases).toHaveBeenCalledWith(TEMPLATE);
    expect(store.conflicts().has('title.paid')).toBe(true);
    expect(store.phrases()[0]?.locales.fr.revision).toBe(7);
  });

  it('« Rétablir » envoie la révision lue et revient au texte du code', async () => {
    const drafted = phrase({ draftState: 'set', draftText: 'Brouillon {ref}' });
    const { store, calls } = setup();
    store.use(TEMPLATE, [drafted]);
    await store.reset(drafted, 'fr');
    expect(calls.resetPhrase).toHaveBeenCalledWith(TEMPLATE, {
      path: 'title.paid',
      locale: 'fr',
      expectedRevision: 2,
    });
    expect(store.pendingCount()).toBe(0);
    expect(store.textOf(store.phrases()[0] ?? drafted, 'fr')).toBe('Commande {ref} payée');
  });

  it('flush envoie tout de suite ce qui attend la pause', async () => {
    const { store, calls } = setup();
    store.edit(phrase(), 'en', 'Order {ref} paid');
    await store.flush();
    expect(calls.savePhraseDraft).toHaveBeenCalledTimes(1);
  });
});
