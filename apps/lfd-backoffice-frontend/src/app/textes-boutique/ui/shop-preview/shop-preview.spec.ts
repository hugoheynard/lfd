import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { SHOP_PREVIEW_URL_TOKEN } from '../../data/shop-preview-config';
import { ShopCopyService } from '../../data/shop-copy.service';
import { adminView, entryView } from '../../shop-copy.testing';
import { CopyNavigation } from '../../state/copy-navigation';
import { DraftWriter } from '../../state/draft-writer';
import { PreviewLink } from '../../state/preview-link';
import { ShopCopyStore } from '../../state/shop-copy-store';
import { ShopPreview } from './shop-preview';

const ORIGIN = 'https://apercu.example';
const SOURCE = 'lfc-shop-copy-preview';

async function render(url: string) {
  TestBed.configureTestingModule({
    imports: [ShopPreview],
    providers: [
      ShopCopyStore,
      CopyNavigation,
      DraftWriter,
      PreviewLink,
      { provide: SHOP_PREVIEW_URL_TOKEN, useValue: url },
      {
        provide: ShopCopyService,
        useValue: {
          load: () =>
            Promise.resolve(
              adminView([
                entryView('cart.title', 'cart', 'Panier', {
                  locales: { fr: { publishedText: 'Mon panier' } },
                }),
              ]),
            ),
        },
      },
      { provide: NotifyService, useValue: { error: vi.fn() } },
      { provide: PermissionsStore, useValue: { can: (_: StaffPermission) => true } },
    ],
  });
  await TestBed.inject(ShopCopyStore).load();
  const fixture = TestBed.createComponent(ShopPreview);
  await fixture.whenStable();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    link: TestBed.inject(PreviewLink),
  };
}

describe('ShopPreview — l’aperçu', () => {
  it('sans adresse configurée, dit « Aperçu indisponible »', async () => {
    const { element } = await render('');
    expect(element.textContent).toContain('Aperçu indisponible');
    expect(element.querySelector('iframe')).toBeNull();
  });

  it('attend ready, puis n’écrit qu’à l’origine de l’aperçu', async () => {
    const { fixture, link, element } = await render(`${ORIGIN}/apercu`);
    expect(element.querySelector('iframe')).not.toBeNull();
    const frame = { postMessage: vi.fn() };
    link.attach(frame);
    link.receive({ origin: ORIGIN, source: frame, data: { source: SOURCE, type: 'ready' } });
    await fixture.whenStable();
    expect(frame.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'show',
        locale: 'fr',
        published: { 'cart.title': 'Mon panier' },
      }),
      ORIGIN,
    );
  });

  it('ignore un « pick » venu d’une autre fenêtre ; ouvre la clé venue de l’iframe', async () => {
    const { link } = await render(`${ORIGIN}/apercu`);
    const navigation = TestBed.inject(CopyNavigation);
    const frame = { postMessage: vi.fn() };
    link.attach(frame);
    link.receive({
      origin: ORIGIN,
      source: {},
      data: { source: SOURCE, type: 'pick', key: 'cart.title' },
    });
    expect(navigation.selectedKey()).toBeNull();
    link.receive({
      origin: ORIGIN,
      source: frame,
      data: { source: SOURCE, type: 'pick', key: 'cart.title' },
    });
    expect(navigation.selectedKey()).toBe('cart.title');
  });
});
