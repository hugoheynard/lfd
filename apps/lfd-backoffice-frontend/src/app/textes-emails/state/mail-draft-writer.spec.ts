import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type {
  MailCopyAdminView,
  MailCopyDraftPayload,
  MailCopyTextView,
  StaffPermission,
} from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { MailCopyService } from '../data/mail-copy.service';
import { mailAdminView, mailTextView, mailView } from '../mail-copy.testing';
import { MailCopyStore } from './mail-copy-store';
import { MAIL_DRAFT_DEBOUNCE_MS, MailDraftWriter } from './mail-draft-writer';

const MAIL = 'customer.order-placed';
const SUBJECT = mailTextView(MAIL, 'subject', 'Commande {ref}', {
  variables: ['ref'],
  requiredVariables: ['ref'],
});

function setup(view: MailCopyAdminView = mailAdminView([mailView(MAIL, [SUBJECT])])) {
  const api = {
    load: vi.fn(() => Promise.resolve(view)),
    saveDraft: vi.fn((_: MailCopyDraftPayload) => Promise.resolve()),
    reset: vi.fn(() => Promise.resolve()),
  };
  const notify = { error: vi.fn(), success: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      MailCopyStore,
      MailDraftWriter,
      { provide: MailCopyService, useValue: api },
      { provide: NotifyService, useValue: notify },
      { provide: PermissionsStore, useValue: { can: (_: StaffPermission) => true } },
    ],
  });
  return {
    api,
    notify,
    store: TestBed.inject(MailCopyStore),
    writer: TestBed.inject(MailDraftWriter),
  };
}

function subject(store: MailCopyStore): MailCopyTextView {
  const text = store.text(MAIL, 'subject');
  if (text === null) {
    throw new Error('texte absent');
  }
  return text;
}

describe('MailDraftWriter — l’enregistrement au fil de la frappe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('n’envoie qu’après la pause, une fois, avec la révision lue, puis retouche le texte', async () => {
    const { api, store, writer } = setup();
    await store.load();
    writer.edit(subject(store), 'en', 'Order');
    writer.edit(subject(store), 'en', 'Order {ref}');
    await vi.advanceTimersByTimeAsync(MAIL_DRAFT_DEBOUNCE_MS - 1);
    expect(api.saveDraft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.saveDraft).toHaveBeenCalledExactlyOnceWith({
      mail: MAIL,
      path: 'subject',
      locale: 'en',
      text: 'Order {ref}',
      expectedRevision: 0,
    });
    expect(subject(store).locales.en).toMatchObject({ draftState: 'set', revision: 1 });
    expect(store.pendingCount()).toBe(1);
    expect(store.current()?.pendingCount).toBe(1);
    expect(store.drafts()).toBe(1);
  });

  it('montre le refus 400 tel quel sous le champ, garde la frappe, et l’efface à la frappe suivante', async () => {
    const { api, notify, store, writer } = setup();
    await store.load();
    api.saveDraft.mockRejectedValueOnce(
      new HttpErrorResponse({
        status: 400,
        error: { message: 'La variable {ref} manque. Permises : {ref}.' },
      }),
    );
    writer.edit(subject(store), 'fr', 'Commande');
    await vi.advanceTimersByTimeAsync(MAIL_DRAFT_DEBOUNCE_MS);
    expect(writer.refusalOf(subject(store), 'fr')).toBe(
      'La variable {ref} manque. Permises : {ref}.',
    );
    expect(writer.textOf(subject(store), 'fr')).toBe('Commande');
    expect(notify.error).not.toHaveBeenCalled();
    writer.edit(subject(store), 'fr', 'Commande {ref}');
    expect(writer.refusalOf(subject(store), 'fr')).toBeNull();
  });

  it('un conflit relit tout et abandonne la frappe du texte', async () => {
    const { api, store, writer } = setup();
    await store.load();
    api.saveDraft.mockRejectedValueOnce(new HttpErrorResponse({ status: 409 }));
    writer.edit(subject(store), 'fr', 'Votre commande {ref}');
    await vi.advanceTimersByTimeAsync(MAIL_DRAFT_DEBOUNCE_MS);
    expect(api.load).toHaveBeenCalledTimes(2);
    expect(writer.conflicts().has(`${MAIL}\u0000subject`)).toBe(true);
    expect(writer.textOf(subject(store), 'fr')).toBe('Commande {ref}');
  });

  it('« Rétablir » un texte publié le marque à rétablir au prochain « Publier »', async () => {
    const published = mailTextView(MAIL, 'subject', 'Commande {ref}', {
      locales: { fr: { publishedText: 'Cmd {ref}', revision: 2 } },
    });
    const { api, store, writer } = setup(mailAdminView([mailView(MAIL, [published])]));
    await store.load();
    await writer.reset(subject(store), 'fr');
    expect(api.reset).toHaveBeenCalledWith({
      mail: MAIL,
      path: 'subject',
      locale: 'fr',
      expectedRevision: 2,
    });
    expect(subject(store).locales.fr).toMatchObject({ draftState: 'reset', revision: 3 });
  });

  it('flush envoie la frappe en attente sans attendre la pause', async () => {
    const { api, store, writer } = setup();
    await store.load();
    writer.edit(subject(store), 'it', 'Ordine {ref}');
    await writer.flush();
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
  });
});
