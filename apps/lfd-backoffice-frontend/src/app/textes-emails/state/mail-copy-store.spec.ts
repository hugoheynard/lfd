import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { MailCopyService } from '../data/mail-copy.service';
import { mailAdminView, mailTextView, mailView, sectionView } from '../mail-copy.testing';
import { MailCopyStore } from './mail-copy-store';

function setup(permissions: readonly StaffPermission[] = ['b2b_storefront:write']) {
  const api = {
    load: vi.fn(() =>
      Promise.resolve(
        mailAdminView(
          [
            mailView('customer.order-placed', [
              mailTextView('customer.order-placed', 'subject', 'A', {
                locales: { fr: { draftState: 'set', draftText: 'B' } },
              }),
            ]),
            mailView('staff.invited', [], {
              audience: 'team',
              family: 'team',
              sections: [sectionView('cta', 'Bouton', 0), sectionView('title', 'Titre', 1)],
              sectionOrder: { draftState: 'set', draft: ['cta', 'title'], revision: 5 },
            }),
          ],
          [mailTextView('customer.gone', 'title', 'X', { locales: { en: { draftState: 'set' } } })],
        ),
      ),
    ),
    publish: vi.fn(() => Promise.resolve({ version: 4 })),
    saveSectionOrder: vi.fn((): Promise<void> => Promise.resolve()),
    resetSectionOrder: vi.fn((): Promise<void> => Promise.resolve()),
  };
  const notify = { error: vi.fn(), success: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      MailCopyStore,
      { provide: MailCopyService, useValue: api },
      { provide: NotifyService, useValue: notify },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
    ],
  });
  return { api, notify, store: TestBed.inject(MailCopyStore) };
}

describe('MailCopyStore', () => {
  it('compte ce qui attend « Publier », orphelins compris', async () => {
    const { store } = setup();
    await store.load();
    // Deux langues de textes, plus l'ordre de sections en brouillon de `staff.invited`.
    expect(store.pendingCount()).toBe(3);
  });

  it('ouvre le premier e-mail, puis celui qu’on choisit', async () => {
    const { store } = setup();
    await store.load();
    expect(store.current()?.mail).toBe('customer.order-placed');
    store.selectedMail.set('staff.invited');
    expect(store.current()?.mail).toBe('staff.invited');
  });

  it('un premier échec de lecture vide l’écran', async () => {
    const { api, store } = setup();
    api.load.mockRejectedValueOnce(new Error('réseau'));
    await store.load();
    expect(store.status()).toBe('failed');
  });

  it('publie, annonce la version et relit', async () => {
    const { api, notify, store } = setup();
    await store.load();
    await store.publish();
    expect(api.publish).toHaveBeenCalledTimes(1);
    expect(notify.success).toHaveBeenCalledWith('Textes des e-mails publiés — version 4.');
    expect(api.load).toHaveBeenCalledTimes(2);
  });

  it('ne publie rien sans le droit d’écrire', async () => {
    const { api, store } = setup(['b2b_storefront:read']);
    await store.load();
    await store.publish();
    expect(api.publish).not.toHaveBeenCalled();
  });

  it('un ordre déplacé entre-temps (409) relit et prévient', async () => {
    const { api, store } = setup();
    await store.load();
    api.saveSectionOrder.mockRejectedValueOnce(new HttpErrorResponse({ status: 409 }));
    await store.moveSection('staff.invited', 'title', -1);
    expect(api.saveSectionOrder).toHaveBeenCalledWith({
      mail: 'staff.invited',
      order: ['title', 'cta'],
      expectedRevision: 5,
    });
    expect(api.load).toHaveBeenCalledTimes(2);
    expect(store.orderRefusal()).toContain('Quelqu’un a déplacé ces sections');
  });

  it('« Rétablir l’ordre » renvoie la révision lue, puis relit', async () => {
    const { api, store } = setup();
    await store.load();
    await store.resetSectionOrder('staff.invited');
    expect(api.resetSectionOrder).toHaveBeenCalledWith({
      mail: 'staff.invited',
      expectedRevision: 5,
    });
    expect(api.load).toHaveBeenCalledTimes(2);
  });

  it('ouvrir un autre e-mail oublie la carte désignée', async () => {
    const { store } = setup();
    await store.load();
    store.spot.set({ card: 'section:title', path: null });
    store.open('staff.invited');
    expect(store.spot()).toBeNull();
  });
});
