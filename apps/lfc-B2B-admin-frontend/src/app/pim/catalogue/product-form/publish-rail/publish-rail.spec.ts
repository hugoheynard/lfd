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
