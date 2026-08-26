import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../product-form-store';
import { provideTestSalesContexts } from '../../../sales-contexts/sales-context-store.testing';
import { PublishRail } from './publish-rail';

/**
 * Ce que la complétude PROMET, et qu'un coup d'œil à l'écran ne suffit pas à
 * vérifier : la barre ne mesure que ce qui bloque, et les traductions
 * n'apparaissent que là où il y a quelque chose à traduire.
 *
 * Les deux règles se ressemblent mais tombent différemment. Compter les
 * traductions ferait d'une fiche publiable une fiche « à 5/9 » — un manque
 * annoncé qui n'existe pas. Les afficher sur une source vide ferait d'une fiche
 * neuve une liste grise avant la première frappe.
 *
 * Tout passe par le DOM rendu, jamais par les membres du composant : ce sont
 * `fold-meter` et `fold-checklist` qui rendent, et ce qu'on veut tenir est ce
 * qu'ils affichent — le jour où l'un change de gabarit, c'est ici qu'on doit
 * l'apprendre.
 */
function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient(), provideTestSalesContexts()],
  });
  return TestBed.inject(ProductFormStore);
}

/** Le rail rendu, une fois le store garni. */
function render(): HTMLElement {
  const fixture = TestBed.createComponent(PublishRail);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/** Les lignes de la checklist, dans l'ordre — l'ordre EST la hiérarchie. */
function lines(host: HTMLElement): string[] {
  return [...host.querySelectorAll('fold-checklist li')].map((li) =>
    (li.textContent ?? '').replace(/\s+/gu, ' ').trim(),
  );
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
  it('mesure les cinq requis, et rien de plus', () => {
    setup();

    expect(meter(render())).toEqual({ now: '0', max: '5' });
  });

  it('ne montre aucune traduction tant que la source est vide', () => {
    setup();

    const rendered = lines(render());
    expect(rendered.some((line) => line.includes('anglais'))).toBe(false);
    expect(rendered).toHaveLength(5);
  });

  it('pose les langues juste APRÈS le champ qu’elles traduisent', () => {
    const store = setup();
    store.nameText.set({ fr: 'Baguette' });
    store.editorial.update((fields) => ({ ...fields, descriptionShort: { fr: 'Tradition' } }));

    const rendered = lines(render());
    const name = rendered.findIndex((line) => line.includes('Nom et famille'));
    const description = rendered.findIndex(
      (line) => line.includes('Description') && !line.includes('·'),
    );

    expect(rendered[name + 1]).toContain('Nom · anglais');
    expect(rendered[name + 2]).toContain('Nom · italien');
    expect(rendered[description + 1]).toContain('Description · anglais');
  });

  it('une traduction s’ajoute à la LISTE, jamais au dénominateur', () => {
    const store = setup();
    store.nameText.set({ fr: 'Baguette' });

    const host = render();
    // Sept lignes affichées, cinq mesurées : c'est toute la règle.
    expect(lines(host)).toHaveLength(7);
    expect(meter(host).max).toBe('5');
  });
});
