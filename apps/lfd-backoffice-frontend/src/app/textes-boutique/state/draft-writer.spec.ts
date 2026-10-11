import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { ShopCopyAdminView, ShopCopyDraftPayload, StaffPermission } from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { ShopCopyService } from '../data/shop-copy.service';
import { adminView, entryView, present } from '../shop-copy.testing';
import { DRAFT_DEBOUNCE_MS, DraftWriter } from './draft-writer';
import { ShopCopyStore } from './shop-copy-store';

const ENTRY = entryView('cart.count', 'cart', '{n} articles', { variables: ['n'] });

function setup(view: ShopCopyAdminView = adminView([ENTRY])) {
  const api = {
    load: vi.fn(() => Promise.resolve(view)),
    saveDraft: vi.fn((_: ShopCopyDraftPayload) => Promise.resolve()),
    reset: vi.fn(() => Promise.resolve()),
  };
  const notify = { error: vi.fn(), success: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      ShopCopyStore,
      DraftWriter,
      { provide: ShopCopyService, useValue: api },
      { provide: NotifyService, useValue: notify },
      { provide: PermissionsStore, useValue: { can: (_: StaffPermission) => true } },
    ],
  });
  return { api, notify, store: TestBed.inject(ShopCopyStore), writer: TestBed.inject(DraftWriter) };
}

describe('DraftWriter — l’enregistrement au fil de la frappe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('n’envoie qu’après la pause, une seule fois, avec la révision lue', async () => {
    const { api, store, writer } = setup();
    await store.load();
    const entry = present(store.entry('cart.count'));
    writer.edit(entry, 'fr', '{n} art');
    writer.edit(entry, 'fr', '{n} articles choisis');
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS - 1);
    expect(api.saveDraft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
    expect(api.saveDraft).toHaveBeenCalledWith({
      key: 'cart.count',
      locale: 'fr',
      text: '{n} articles choisis',
      expectedRevision: 0,
    });
    expect(store.entry('cart.count')?.locales.fr).toMatchObject({ draftState: 'set', revision: 1 });
    expect(store.pendingCount()).toBe(1);
  });

  it('la seconde écriture part sur la révision rendue par la première', async () => {
    const { api, store, writer } = setup();
    await store.load();
    writer.edit(present(store.entry('cart.count')), 'fr', '{n} a');
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS);
    writer.edit(present(store.entry('cart.count')), 'fr', '{n} b');
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS);
    expect(api.saveDraft.mock.calls.map(([payload]) => payload.expectedRevision)).toEqual([0, 1]);
  });

  it('refuse à l’écran un texte qui perd une variable : rien ne part', async () => {
    const { api, store, writer } = setup();
    await store.load();
    const entry = present(store.entry('cart.count'));
    writer.edit(entry, 'fr', 'des articles');
    expect(writer.missing(entry, 'fr')).toEqual(['n']);
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS * 2);
    expect(api.saveDraft).not.toHaveBeenCalled();
  });

  it('un 409 se dit, abandonne la frappe de la clé et relit', async () => {
    const { api, store, writer, notify } = setup();
    await store.load();
    api.saveDraft.mockRejectedValueOnce(new HttpErrorResponse({ status: 409 }));
    writer.edit(present(store.entry('cart.count')), 'fr', '{n} conflit');
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS);
    expect(writer.conflicts().has('cart.count')).toBe(true);
    expect(api.load).toHaveBeenCalledTimes(2);
    expect(writer.textOf(present(store.entry('cart.count')), 'fr')).toBe('{n} articles');
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('« revenir à l’original » remet à zéro au prochain Publier', async () => {
    const published = entryView('cart.count', 'cart', '{n} articles', {
      variables: ['n'],
      locales: { en: { publishedText: '{n} items', revision: 4 } },
    });
    const { api, store, writer } = setup(adminView([published]));
    await store.load();
    await writer.reset(present(store.entry('cart.count')), 'en');
    expect(api.reset).toHaveBeenCalledWith({
      key: 'cart.count',
      locale: 'en',
      expectedRevision: 4,
    });
    expect(store.entry('cart.count')?.locales.en).toMatchObject({
      draftState: 'reset',
      revision: 5,
    });
  });

  it('flush envoie la frappe en attente sans attendre la pause', async () => {
    const { api, store, writer } = setup();
    await store.load();
    writer.edit(present(store.entry('cart.count')), 'it', '{n} articoli');
    await writer.flush();
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
  });
});
