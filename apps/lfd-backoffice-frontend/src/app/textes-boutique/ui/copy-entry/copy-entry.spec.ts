import { TestBed } from '@angular/core/testing';
import type { ContentLocale, ShopCopyEntryView, StaffPermission } from '@lfd/contracts';
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
  locale: ContentLocale = 'fr',
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
  TestBed.inject(CopyNavigation).locale.set(locale);
  const fixture = TestBed.createComponent(CopyEntry);
  fixture.componentRef.setInput('entry', entry);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    writer: TestBed.inject(DraftWriter),
    element,
    field: () => element.querySelector('textarea')?.value,
  };
}

describe('CopyEntry — un texte, dans la langue affichée', () => {
  const ENTRY = entryView('cart.count', 'cart', '{n} articles', {
    variables: ['n'],
    staleTranslations: ['en'],
  });

  it('un seul champ, pré-rempli du texte du code, nommé en clair', async () => {
    const { element, field } = await render(ENTRY);
    expect(element.querySelectorAll('fold-textarea')).toHaveLength(1);
    expect(field()).toBe('{n} articles');
    expect(element.textContent).toContain('Count');
    expect(element.textContent).not.toContain('Texte d’origine');
    expect(element.textContent).toContain('À garder :');
    expect(element.textContent).toContain('{n}');
  });

  it('le publié passe avant le texte du code, et se dit « Publié »', async () => {
    const published = entryView('cart.title', 'cart', 'Code', {
      locales: { fr: { publishedText: 'En ligne' } },
    });
    const { element, field } = await render(published);
    expect(field()).toBe('En ligne');
    expect(element.textContent).toContain('Publié');
    expect(element.textContent).toContain('Texte d’origine');
    expect(element.textContent).toContain('Revenir à l’original');
  });

  it('le brouillon passe avant tout, et se dit « Brouillon »', async () => {
    const draft = entryView('cart.title', 'cart', 'Code', {
      locales: { fr: { publishedText: 'En ligne', draftState: 'set', draftText: 'Nouveau' } },
    });
    const { element, field } = await render(draft);
    expect(field()).toBe('Nouveau');
    expect(element.textContent).toContain('Brouillon');
  });

  it('montre la langue choisie, et elle seule', async () => {
    const translated = entryView('cart.title', 'cart', 'Panier', {
      locales: { en: { original: 'Basket' } },
    });
    const { field } = await render(translated, 'en');
    expect(field()).toBe('Basket');
  });

  it('n’avertit d’une traduction en retard que dans sa langue', async () => {
    const warning = 'Le français a changé depuis cette traduction.';
    expect((await render(ENTRY, 'en')).element.textContent).toContain(warning);
    TestBed.resetTestingModule();
    expect((await render(ENTRY, 'fr')).element.textContent).not.toContain(warning);
  });

  it('refuse tout de suite une variable perdue', async () => {
    const { fixture, writer, element } = await render(ENTRY);
    writer.edit(ENTRY, 'fr', 'des articles');
    await fixture.whenStable();
    expect(element.textContent).toContain('a perdu la variable');
  });

  it('sans le droit d’écrire, on lit sans bouton', async () => {
    const published = entryView('cart.count', 'cart', 'x', {
      locales: { fr: { publishedText: 'y' } },
    });
    const { element } = await render(published, 'fr', []);
    expect(element.textContent).not.toContain('Revenir à l’original');
  });
});
