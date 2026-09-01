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
    store['readinessStaleValue'].set(false);

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
    store['readinessStaleValue'].set(true);

    const host = render();
    // Savoir qu'Untel avait validé AVANT la modification vaut mieux que ne plus
    // rien savoir : la signature reste lisible, l'avertissement la qualifie.
    expect(text(host)).toContain('staff_hugo');
    expect(text(host)).toContain('modifiée depuis');
    expect(text(readyButton(host))).toContain('Déclarer à nouveau');
  });

  /**
   * Ce que la complétude ne peut pas voir, et qu'elle ne verra jamais.
   *
   * Elle compte « Allergènes déclarés » comme satisfait dès qu'une affirmation
   * existe — et « aucun allergène » en est une, fausse mais présente. Une fiche
   * que sa propre composition dément était donc à 10/10, verte, et signable :
   * l'avertissement s'affichait, et le bouton restait armé juste en dessous
   * (constaté par Hugo le 2026-09-01, après la tranche 5).
   */
  describe('quand la composition dément la déclaration', () => {
    /** « Aucun allergène » coché, et un ingrédient cité qui en porte un. */
    function contradict(store: ProductFormStore): void {
      store.entries.set([{ code: 'milk', label: 'Lait', incoCategory: 'MILK', incoLabel: 'Lait' }]);
      store['citedAllergensValue'].set(['milk']);
    }

    it('REFUSE la signature sur une fiche par ailleurs complète', () => {
      const store = setup();
      fill(store);
      contradict(store);

      const host = render();
      expect(readyButton(host)?.disabled).toBe(true);
      expect(text(host)).toContain('contredit la déclaration');
    });

    it('n’invoque pas la complétude comme motif : il ne manque rien', () => {
      const store = setup();
      fill(store);
      contradict(store);

      expect(text(render())).not.toContain('manque');
    });

    it('rouvre la signature dès que la contradiction est levée', () => {
      const store = setup();
      fill(store);
      contradict(store);
      store.adoptCitedAllergens();

      expect(readyButton(render())?.disabled).toBe(false);
    });

    /**
     * Une fiche DÉJÀ signée qui se met à se contredire — un ingrédient ajouté
     * après coup. La signature reste lisible : c'est un fait daté, on ne
     * l'efface pas dans le dos de celui qui l'a posée. Mais on ne la laisse pas
     * se reposer, et le bouton réapparaît désarmé pour le dire.
     */
    it('laisse la signature en place, et refuse qu’on la repose', () => {
      const store = setup();
      fill(store);
      store['readinessValue'].set({ readyAt: '2026-08-31T09:00:00.000Z', readyBy: 'staff_hugo' });
      store['readinessStaleValue'].set(false);
      contradict(store);

      const host = render();
      expect(text(host)).toContain('staff_hugo');
      expect(readyButton(host)?.disabled).toBe(true);
    });

    /**
     * ⚠️ La limite, et elle est voulue. « Contient du gluten » est une
     * affirmation PARTIELLE : un lait cité ne la rend pas fausse, il la
     * complète. Bloquer là ferait de la composition une entrée obligatoire de
     * la déclaration réglementaire — exactement la « valeur de contrôle » que
     * le contrat lui refuse (D5). Seule l'affirmation UNIVERSELLE se dément.
     */
    it('ne bloque PAS sur une simple proposition — la composition ne décide rien', () => {
      const store = setup();
      fill(store);
      store.declaresNone.set(false);
      store.selected.set(['gluten']);
      contradict(store);

      const host = render();
      expect(store.citedNotDeclared().map((choice) => choice.code)).toEqual(['milk']);
      expect(readyButton(host)?.disabled).toBe(false);
    });
  });

  /**
   * Ce que la complétude ne mesure pas, et ne mesurera pas : où la fiche se
   * vend. Elle compte ce que la fiche PORTE — un nom, un prix, des allergènes,
   * un visuel. Une fiche pouvait donc être à 10/10, signée, « En ligne », et
   * n'apparaître dans aucun contexte : tout juste, et rien ne se passe
   * (audit 2026-09-01, §11).
   */
  describe('quand la fiche n’est vendue nulle part', () => {
    /** Un lieu qui vend, sans quoi le garde « le référentiel a répondu » ferme. */
    function sellSomewhere(store: ProductFormStore): void {
      store.channelsOverride.set([{ pointOfSaleId: 'pos_b2b', context: 'b2b' }]);
    }

    it('le dit, sur une fiche par ailleurs complète', () => {
      const store = setup();
      fill(store);

      expect(store.soldNowhere()).toBe(true);
      expect(text(render())).toContain('aucun contexte');
    });

    it('se tait dès qu’un contexte la vend', () => {
      const store = setup();
      fill(store);
      sellSomewhere(store);

      expect(store.soldNowhere()).toBe(false);
      expect(text(render())).not.toContain('aucun contexte');
    });

    /**
     * ⚠️ Un avertissement, jamais un blocage : préparer une fiche avant
     * d'ouvrir ses canaux est un usage normal, et l'interdire coûterait plus
     * que le silence qu'on répare.
     */
    it('n’empêche NI de signer, NI de publier au catalogue', () => {
      const store = setup();
      fill(store);

      expect(store.soldNowhere()).toBe(true);
      expect(readyButton(render())?.disabled).toBe(false);
    });
  });
});
