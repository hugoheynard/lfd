import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type {
  MailDocumentBlockPreviewPayload,
  MailDocumentBlockPreviewView,
} from '@lfd/mail-blocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MailEditorService } from '../data/mail-editor.service';
import { MailBlockPreviewsStore } from './mail-block-previews-store';

const TEMPLATE = 'customer.order-ready';
const PAYLOAD: MailDocumentBlockPreviewPayload = {
  document: { template: TEMPLATE, blocks: [] },
  locale: 'fr',
  source: 'draft',
};

function rendered(html: string): MailDocumentBlockPreviewView {
  return {
    template: TEMPLATE,
    locale: 'fr',
    subject: 'Objet',
    header: '',
    footer: '',
    blocks: [{ blockId: 'b', html }],
    cellBlocks: [{ blockId: 'dans-colonne', html: '<p>cellule</p>' }],
  };
}

function setup(blockPreviews: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    providers: [
      MailBlockPreviewsStore,
      { provide: MailEditorService, useValue: { blockPreviews } },
    ],
  });
  return TestBed.inject(MailBlockPreviewsStore);
}

describe('MailBlockPreviewsStore — le rendu du canevas', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('rend après la pause, et une nouvelle demande remplace celle qui attend', async () => {
    const blockPreviews = vi.fn(() => Promise.resolve(rendered('<p>a</p>')));
    const store = setup(blockPreviews);
    store.request(TEMPLATE, PAYLOAD, 800);
    store.request(TEMPLATE, { ...PAYLOAD, locale: 'en' }, 800);
    await vi.advanceTimersByTimeAsync(799);
    expect(blockPreviews).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(blockPreviews).toHaveBeenCalledTimes(1);
    expect(blockPreviews).toHaveBeenCalledWith(TEMPLATE, { ...PAYLOAD, locale: 'en' });
    expect(store.fragments().get('b')).toBe('<p>a</p>');
    expect(store.fragments().get('dans-colonne')).toBe('<p>cellule</p>');
  });

  it('jette une réponse plus ancienne arrivée après la plus récente', async () => {
    let releaseOld: (view: MailDocumentBlockPreviewView) => void = () => undefined;
    const blockPreviews = vi
      .fn()
      .mockReturnValueOnce(new Promise((resolve) => (releaseOld = resolve)))
      .mockResolvedValueOnce(rendered('<p>récent</p>'));
    const store = setup(blockPreviews);
    const old = store.render(TEMPLATE, PAYLOAD);
    await store.render(TEMPLATE, PAYLOAD);
    releaseOld(rendered('<p>ancien</p>'));
    await old;
    expect(store.fragments().get('b')).toBe('<p>récent</p>');
    expect(store.loading()).toBe(false);
  });

  it('un échec garde le rendu précédent et dit le refus du serveur', async () => {
    const blockPreviews = vi
      .fn()
      .mockResolvedValueOnce(rendered('<p>a</p>'))
      .mockRejectedValueOnce(
        new HttpErrorResponse({ status: 400, error: { message: 'Document refusé.' } }),
      );
    const store = setup(blockPreviews);
    await store.render(TEMPLATE, PAYLOAD);
    await store.render(TEMPLATE, PAYLOAD);
    expect(store.fragments().get('b')).toBe('<p>a</p>');
    expect(store.error()).toContain('Document refusé.');
  });

  it('clear oublie le rendu et la demande qui attend', async () => {
    const blockPreviews = vi.fn(() => Promise.resolve(rendered('<p>a</p>')));
    const store = setup(blockPreviews);
    await store.render(TEMPLATE, PAYLOAD);
    store.request(TEMPLATE, PAYLOAD, 10);
    store.clear();
    await vi.advanceTimersByTimeAsync(10);
    expect(blockPreviews).toHaveBeenCalledTimes(1);
    expect(store.view()).toBeNull();
  });
});
