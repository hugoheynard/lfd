import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../product-form-store';
import { provideTestSalesContexts } from '../../../sales-contexts/sales-context-store.testing';
import { PublishRail } from './publish-rail';

/**
 * Ce que le rail PROMET à l'écran, et qu'un coup d'œil ne suffit pas à vérifier :
 * la barre mesure tout ce qui bloque — langues comprises — et les langues sont
 * REPLIÉES, comptées dans leur résumé.
 *
 * La règle elle-même se tient dans `completeness.spec.ts` ; ici on ne tient que
 * le rendu. Tout passe par le DOM, jamais par les membres du composant : ce sont
 * `fold-meter`, `fold-checklist` et `fold-disclosure` qui rendent, et le jour où
 * l'un change de gabarit, c'est ici qu'on doit l'apprendre.
 */
function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient(), provideTestSalesContexts()],
  });
  return TestBed.inject(ProductFormStore);
}

function render(): HTMLElement {
  const fixture = TestBed.createComponent(PublishRail);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function text(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

/** Les exigences de premier rang — celles qu'on lit sans rien déplier. */
function topLines(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.pr-check > fold-checklist li')].map((li) => text(li));
}

/** Les lignes cachées derrière un repli. */
function foldedLines(host: HTMLElement): string[] {
  return [...host.querySelectorAll('fold-disclosure li')].map((li) => text(li));
}

/** Le bouton du bloc « Publiable », s'il est rendu. */
function readyButton(host: HTMLElement): HTMLButtonElement | null {
  return [...host.querySelectorAll('button')].find((button) =>
    text(button).startsWith('Déclarer'),
  ) as HTMLButtonElement | null;
}

/** La mesure telle qu'un lecteur d'écran l'entend. */
function meter(host: HTMLElement): { readonly now: string | null; readonly max: string | null } {
  const bar = host.querySelector('[role="meter"]');
  return {
    now: bar?.getAttribute('aria-valuenow') ?? null,
    max: bar?.getAttribute('aria-valuemax') ?? null,
  };
}

describe('PublishRail — la complétude', () => {
  it('mesure dix conditions, dont les six langues', () => {
    setup();

    expect(meter(render())).toEqual({ now: '0', max: '10' });
  });

  it('garde les langues repliées : six exigences se lisent au premier rang', () => {
    setup();

    // « À faire » est le préfixe que `fold-checklist` réserve aux lecteurs
    // d'écran : il est dans le texte, invisible. On le garde dans l'attendu
    // plutôt que de le rincer — il prouve que l'état est ANNONCÉ, pas seulement
    // colorié, et c'est la moitié de ce qui rend cette liste lisible.
    const host = render();
    expect(topLines(host)).toEqual([
      'À faireNom',
      'À faireFamille',
      'À fairePrix',
      'À faireAllergènes déclarés',
      'À faireDescription',
      'À faireAu moins un visuel',
    ]);
    expect(foldedLines(host)).toHaveLength(6);
  });

  it('dit combien de langues manquent sans qu’on ait à déplier', () => {
    const store = setup();
    store.nameText.set({ fr: 'Baguette', en: 'Baguette' });

    const summaries = [...render().querySelectorAll('fold-disclosure [summary]')].map((s) =>
      text(s),
    );
    expect(summaries[0]).toBe('2/3 langues');
    expect(summaries[1]).toBe('0/3 langues');
  });

  it('avance d’un cran par langue remplie — une traduction n’est plus gratuite', () => {
    const store = setup();
    store.nameText.set({ fr: 'Baguette' });

    expect(meter(render()).now).toBe('1');
  });
});

/**
 * Le second bloc : le geste que la complétude ne peut pas faire.
 *
 * La barre mesure la FORME — dix conditions remplies. Elle ne dira jamais que
 * 10,00 € est le bon prix. Ce qui se tient ici, c'est donc que le bouton ne
 * s'arme pas avant que signer ait un sens, et que la signature se dise périmée
 * plutôt que de disparaître quand la fiche bouge après.
 */
describe('PublishRail — la déclaration « publiable »', () => {
  /** Une fiche à laquelle il ne manque rien. */
  function fill(store: ProductFormStore): void {
    store.nameText.set({ fr: 'Baguette', en: 'Baguette', it: 'Baguette' });
    store.categoryId.set('cat_1');
    store.priceEur.set(2.1);
    store.declaresNone.set(true);
    store.editorial.update((fields) => ({
      ...fields,
      descriptionShort: { fr: 'Tradition', en: 'Tradition', it: 'Tradizione' },
    }));
    store.media.set([{ role: 'gallery', url: 'https://cdn.test/a.jpg', name: 'a.jpg' }]);
  }

  it('désarme le bouton tant qu’il manque quelque chose, et dit combien', () => {
    setup();

    const host = render();
    expect(readyButton(host)?.disabled).toBe(true);
    expect(text(host).includes('10 conditions manquent encore')).toBe(true);
  });

  it('arme le bouton une fois les dix conditions tenues', () => {
    fill(setup());

    expect(readyButton(render())?.disabled).toBe(false);
  });

  /**
   * Les deux dates s'écrivent par leur signal privé, en accès indexé.
   *
   * Elles n'ont pas de setter public — ce sont des faits DU SERVEUR, et le
   * store les hydrate depuis lui. Les poser par la voie de production
   * demanderait de doubler la couche HTTP entière pour tenir une règle de
   * RENDU, ce qui déplacerait le test loin de ce qu'il vérifie. L'accès indexé
   * est le compromis assumé : il casse si le champ est renommé, et c'est
   * précisément le signal qu'on veut.
   */
  it('affiche la signature, sa date et son auteur', () => {
    const store = setup();
    fill(store);
    store['readinessValue'].set({ readyAt: '2026-08-31T09:00:00.000Z', readyBy: 'staff_hugo' });
    store['contentUpdatedAtValue'].set('2026-08-31T08:00:00.000Z');

    const host = render();
    expect(text(host)).toContain('Déclarée publiable le 31 août 2026');
    expect(text(host)).toContain('staff_hugo');
    // Signée et à jour : plus rien à déclarer, donc plus de bouton.
    expect(readyButton(host)).toBeUndefined();
  });

  it('dit que la fiche a bougé depuis, au lieu d’effacer la signature', () => {
    const store = setup();
    fill(store);
    store['readinessValue'].set({ readyAt: '2026-08-31T08:00:00.000Z', readyBy: 'staff_hugo' });
    store['contentUpdatedAtValue'].set('2026-08-31T09:00:00.000Z');

    const host = render();
    // Savoir qu'Untel avait validé AVANT la modification vaut mieux que ne plus
    // rien savoir : la signature reste lisible, l'avertissement la qualifie.
    expect(text(host)).toContain('staff_hugo');
    expect(text(host)).toContain('modifiée depuis');
    expect(text(readyButton(host))).toContain('Déclarer à nouveau');
  });
});
