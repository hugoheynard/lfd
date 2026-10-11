import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { ShopCopyService } from '../../data/shop-copy.service';
import { adminView, entryView } from '../../shop-copy.testing';
import { CopyNavigation } from '../../state/copy-navigation';
import { DraftWriter } from '../../state/draft-writer';
import { ShopCopyStore } from '../../state/shop-copy-store';
import { CopyTexts } from './copy-texts';

async function render() {
  const view = adminView(
    [
      entryView('cart.title', 'cart', 'Votre panier'),
      entryView('cart.empty.kicker', 'cart', 'Rien encore'),
      entryView('nav.home', 'nav', 'Accueil'),
    ],
    [entryView('old.key', null, '', { locales: { fr: { publishedText: 'Ancien texte' } } })],
  );
  TestBed.configureTestingModule({
    imports: [CopyTexts],
    providers: [
      ShopCopyStore,
      CopyNavigation,
      DraftWriter,
      { provide: ShopCopyService, useValue: { load: () => Promise.resolve(view) } },
      { provide: NotifyService, useValue: { error: vi.fn() } },
      { provide: PermissionsStore, useValue: { can: (_: StaffPermission) => true } },
    ],
  });
  await TestBed.inject(ShopCopyStore).load();
  const fixture = TestBed.createComponent(CopyTexts);
  await fixture.whenStable();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    navigation: TestBed.inject(CopyNavigation),
  };
}

describe('CopyTexts — les textes de l’espace', () => {
  it('montre l’espace ouvert, et les orphelins à part', async () => {
    const { element } = await render();
    const fields = [...element.querySelectorAll('textarea')].map((field) => field.value);
    expect(fields).toContain('Votre panier');
    expect(fields).not.toContain('Accueil');
    expect(element.textContent).toContain('Textes que le code ne connaît plus');
    expect(element.textContent).toContain('old.key');
  });

  it('range les textes sous l’intertitre de leur groupe', async () => {
    const { element } = await render();
    const titles = [...element.querySelectorAll('fold-element-title')].map((node) =>
      node.textContent?.trim(),
    );
    expect(titles.slice(0, 3)).toEqual(['Titre', 'Vide', 'Surtitre']);
  });

  it('une recherche sans résultat le dit', async () => {
    const { fixture, element, navigation } = await render();
    navigation.query.set('introuvable');
    await fixture.whenStable();
    expect(element.textContent).toContain('Aucun texte');
  });
});
