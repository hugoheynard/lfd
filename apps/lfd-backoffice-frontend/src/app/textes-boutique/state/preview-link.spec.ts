import { TestBed } from '@angular/core/testing';
import type { ShopCopyDraftPayload, StaffPermission } from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { SHOP_PREVIEW_URL_TOKEN } from '../data/shop-preview-config';
import { ShopCopyService } from '../data/shop-copy.service';
import { adminView, entryView } from '../shop-copy.testing';
import { CopyNavigation } from './copy-navigation';
import { DRAFT_DEBOUNCE_MS, DraftWriter } from './draft-writer';
import { PreviewLink } from './preview-link';
import { ShopCopyStore } from './shop-copy-store';

const ORIGIN = 'https://apercu.example';
const SOURCE = 'lfc-shop-copy-preview';

async function setup(canWrite = true) {
  const api = {
    load: vi.fn(() =>
      Promise.resolve(
        adminView([entryView('cart.count', 'cart', '{n} articles', { variables: ['n'] })]),
      ),
    ),
    saveDraft: vi.fn((_: ShopCopyDraftPayload) => Promise.resolve()),
    reset: vi.fn(() => Promise.resolve()),
  };
  TestBed.configureTestingModule({
    providers: [
      ShopCopyStore,
      CopyNavigation,
      DraftWriter,
      PreviewLink,
      { provide: SHOP_PREVIEW_URL_TOKEN, useValue: `${ORIGIN}/apercu` },
      { provide: ShopCopyService, useValue: api },
      { provide: NotifyService, useValue: { error: vi.fn() } },
      { provide: PermissionsStore, useValue: { can: (_: StaffPermission) => canWrite } },
    ],
  });
  await TestBed.inject(ShopCopyStore).load();
  const link = TestBed.inject(PreviewLink);
  const frame = { postMessage: vi.fn() };
  link.attach(frame);
  const edit = (data: Record<string, unknown>) =>
    link.receive({
      origin: ORIGIN,
      source: frame,
      data: { source: SOURCE, type: 'edit', ...data },
    });
  return { api, frame, edit, writer: TestBed.inject(DraftWriter) };
}

describe('PreviewLink — un texte tapé dans l’aperçu', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('passe par le DraftWriter : même pause, même révision', async () => {
    const { api, edit, writer } = await setup();
    edit({ key: 'cart.count', locale: 'fr', text: '{n} pains' });
    expect(writer.typedIn('fr').get('cart.count')).toBe('{n} pains');
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS);
    expect(api.saveDraft).toHaveBeenCalledWith({
      key: 'cart.count',
      locale: 'fr',
      text: '{n} pains',
      expectedRevision: 0,
    });
  });

  it('une variable perdue : rien d’écrit, et l’aperçu reçoit edit-refused', async () => {
    const { api, edit, frame, writer } = await setup();
    edit({ key: 'cart.count', locale: 'fr', text: 'des pains' });
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS);
    expect(api.saveDraft).not.toHaveBeenCalled();
    expect(writer.typedIn('fr').size).toBe(0);
    expect(frame.postMessage).toHaveBeenCalledWith(
      { source: SOURCE, type: 'edit-refused', key: 'cart.count', reason: 'Il faut garder {n}' },
      ORIGIN,
    );
  });

  it('ignore une autre langue que celle affichée, et une clé inconnue', async () => {
    const { api, edit, frame, writer } = await setup();
    edit({ key: 'cart.count', locale: 'en', text: '{n} items' });
    edit({ key: 'nope.nothing', locale: 'fr', text: 'x' });
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS);
    expect(api.saveDraft).not.toHaveBeenCalled();
    expect(writer.typedIn('fr').size + writer.typedIn('en').size).toBe(0);
    expect(frame.postMessage).not.toHaveBeenCalled();
  });

  it('sans droit d’écriture : rien d’écrit, refus expliqué', async () => {
    const { api, edit, frame } = await setup(false);
    edit({ key: 'cart.count', locale: 'fr', text: '{n} pains' });
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS);
    expect(api.saveDraft).not.toHaveBeenCalled();
    expect(frame.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'edit-refused', key: 'cart.count' }),
      ORIGIN,
    );
  });
});
