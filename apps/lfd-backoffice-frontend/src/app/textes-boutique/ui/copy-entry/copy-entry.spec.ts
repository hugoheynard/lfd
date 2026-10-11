import { TestBed } from '@angular/core/testing';
import type { ShopCopyEntryView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { ShopCopyService } from '../../data/shop-copy.service';
import { adminView, entryView } from '../../shop-copy.testing';
import { CopyNavigation } from '../../state/copy-navigation';
import { DraftWriter } from '../../state/draft-writer';
import { ShopCopyStore } from '../../state/shop-copy-store';
import { CopyEntry } from './copy-entry';

async function render(
  entry: ShopCopyEntryView,
  permissions: readonly StaffPermission[] = ['b2b_storefront:write'],
) {
  TestBed.configureTestingModule({
    imports: [CopyEntry],
    providers: [
      ShopCopyStore,
      CopyNavigation,
      DraftWriter,
      { provide: ShopCopyService, useValue: { load: () => Promise.resolve(adminView([entry])) } },
      { provide: NotifyService, useValue: { error: vi.fn() } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
    ],
  });
  await TestBed.inject(ShopCopyStore).load();
  const fixture = TestBed.createComponent(CopyEntry);
  fixture.componentRef.setInput('entry', entry);
  await fixture.whenStable();
  return {
    fixture,
    writer: TestBed.inject(DraftWriter),
    element: fixture.nativeElement as HTMLElement,
  };
}

describe('CopyEntry — un texte en trois langues', () => {
  const ENTRY = entryView('cart.count', 'cart', '{n} articles', {
    variables: ['n'],
    staleTranslations: ['en'],
  });

  it('montre les trois langues, le texte du code et ses variables en pastilles', async () => {
    const { element } = await render(ENTRY);
    expect(element.querySelectorAll('fold-textarea')).toHaveLength(3);
    expect(element.textContent).toContain('Texte du code');
    expect(element.textContent).toContain('{n}');
  });

  it('avertit quand le français a changé depuis une traduction', async () => {
    const { element } = await render(ENTRY);
    expect(element.textContent).toContain('Le français a changé depuis cette traduction.');
  });

  it('refuse tout de suite une variable perdue', async () => {
    const { fixture, writer, element } = await render(ENTRY);
    writer.edit(ENTRY, 'fr', 'des articles');
    await fixture.whenStable();
    expect(element.textContent).toContain('a perdu la variable');
  });

  it('propose de revenir à l’original quand la boutique sert un remplacement', async () => {
    const published = entryView('cart.count', 'cart', 'x', {
      locales: { fr: { publishedText: 'y' } },
    });
    const { element } = await render(published);
    expect(element.textContent).toContain('Revenir à l’original');
  });

  it('sans le droit d’écrire, on lit sans bouton', async () => {
    const published = entryView('cart.count', 'cart', 'x', {
      locales: { fr: { publishedText: 'y' } },
    });
    const { element } = await render(published, []);
    expect(element.textContent).not.toContain('Revenir à l’original');
  });
});
