import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { ShopCopyService } from '../data/shop-copy.service';
import { adminView, entryView } from '../shop-copy.testing';
import { ShopCopyStore } from './shop-copy-store';

function setup(permissions: readonly StaffPermission[] = ['b2b_storefront:write']) {
  const api = {
    load: vi.fn(() =>
      Promise.resolve(
        adminView([
          entryView('a', 'cart', 'A', { locales: { fr: { draftState: 'set', draftText: 'B' } } }),
        ]),
      ),
    ),
    publish: vi.fn(() => Promise.resolve({ version: 4 })),
  };
  const notify = { error: vi.fn(), success: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      ShopCopyStore,
      { provide: ShopCopyService, useValue: api },
      { provide: NotifyService, useValue: notify },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
    ],
  });
  return { api, notify, store: TestBed.inject(ShopCopyStore) };
}

describe('ShopCopyStore', () => {
  it('compte ce qui attend Publier', async () => {
    const { store } = setup();
    await store.load();
    expect(store.status()).toBe('ready');
    expect(store.pendingCount()).toBe(1);
  });

  it('un premier chargement raté vide l’écran et dit pourquoi', async () => {
    const { api, store } = setup();
    api.load.mockRejectedValueOnce(new HttpErrorResponse({ status: 500 }));
    await store.load();
    expect(store.status()).toBe('failed');
    expect(store.loadError()).not.toBeNull();
  });

  it('publie, annonce la version et relit', async () => {
    const { api, notify, store } = setup();
    await store.load();
    await store.publish();
    expect(api.publish).toHaveBeenCalledTimes(1);
    expect(notify.success).toHaveBeenCalledWith('Textes publiés — version 4.');
    expect(api.load).toHaveBeenCalledTimes(2);
  });

  it('un refus de publication se dit, et l’écran relit', async () => {
    const { api, notify, store } = setup();
    await store.load();
    api.publish.mockRejectedValueOnce(new HttpErrorResponse({ status: 409 }));
    await store.publish();
    expect(notify.error).toHaveBeenCalled();
    expect(store.publishing()).toBe(false);
  });

  it('sans le droit d’écrire, rien ne part', async () => {
    const { api, store } = setup([]);
    await store.load();
    await store.publish();
    expect(api.publish).not.toHaveBeenCalled();
  });
});
