import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { MailCopyService } from '../data/mail-copy.service';
import { mailAdminView, mailTextView, mailView } from '../mail-copy.testing';
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
            mailView('staff.invited', [], { audience: 'team', family: 'team' }),
          ],
          [mailTextView('customer.gone', 'title', 'X', { locales: { en: { draftState: 'set' } } })],
        ),
      ),
    ),
    publish: vi.fn(() => Promise.resolve({ version: 4 })),
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
    expect(store.pendingCount()).toBe(2);
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
});
