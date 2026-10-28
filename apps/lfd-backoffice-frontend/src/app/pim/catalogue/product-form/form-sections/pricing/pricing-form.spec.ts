import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../../product-form-store';
import { provideTestSalesContexts } from '../../../../sales-contexts/sales-context-store.testing';
import { PricingForm } from './pricing-form';

function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient(), provideTestSalesContexts()],
  });
  return TestBed.inject(ProductFormStore);
}

/** Une famille au taux réduit, telle que le référentiel la rend. */
function withFamily(store: ProductFormStore): void {
  store.rates.set([
    {
      id: 'tva_55',
      name: 'Réduit',
      description: '',
      percent: 5.5,
      usage: { takeaway: 0, eatIn: 0 },
    },
    {
      id: 'tva_20',
      name: 'Normal',
      description: '',
      percent: 20,
      usage: { takeaway: 0, eatIn: 0 },
    },
  ]);
  store.categories.set([
    {
      id: 'cat_tartes',
      name: { fr: 'Tartes' },
      slug: { fr: 'tartes' },
      parentId: null,
      position: 1,
      isArchived: false,
      vatByContext: { takeaway: 'tva_55', eatIn: 'tva_55', b2b: 'tva_20' },
      activeProductCount: 0,
      audience: 'both',
    },
  ]);
  store.categoryId.set('cat_tartes');
}

describe('PricingForm', () => {
  // Le bouton d'enregistrement a QUITTÉ le panneau : il vit dans l'en-tête de la
  // section (`app-section-state`), à droite de son titre, et n'apparaît qu'à la
  // première frappe. Un panneau qui garderait le sien en poserait un SECOND —
  // c'est très exactement les « sept boutons d'enregistrement dispersés » que la
  // refonte devait supprimer, et ils avaient survécu à l'arrivée du premier.
  it('ne porte aucun bouton d’enregistrement — il vit dans l’en-tête de section', () => {
    const store = setup();
    store.isEdit.set(true);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.section-footer')).toBeNull();
    const labels = [...root.querySelectorAll('button')].map((b) => b.textContent ?? '');
    expect(labels.some((label) => label.includes('Enregistrer'))).toBe(false);
  });
  /**
   * Le sens de lecture s'est INVERSÉ : on saisit le prix d'étiquette, et
   * l'écran montre les hors taxe qu'il produit. Une fiche neuve naît donc au
   * TTC — la faire naître en hors taxe obligerait à la basculer aussitôt.
   */
  it('demande un prix public TTC — ce sont les HT qui se calculent', () => {
    setup();
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Prix public TTC');
  });

  it('montre le régime À CÔTÉ du prix, pas dans une autre section', () => {
    // « 24,50 » et « TVA 5,5 % » sont une seule information : ce qu'on facture.
    // Les séparer obligeait à replier une section pour en déplier une autre.
    const store = setup();
    withFamily(store);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Prix public TTC');
    expect(text).toContain('Tartes');
    expect(text).toContain('5,5 %');
  });

  /** La matrice des canaux est partie en X4 : plus de geste pour la redéfinir. */
  it('n’offre plus de redéfinir les canaux', () => {
    const store = setup();
    withFamily(store);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'Redéfinir les canaux',
    );
  });

  /**
   * L'ordre est celui du REGISTRE (`position`), pas une déduction.
   *
   * Il était « ce qui n'a pas besoin d'un lieu d'abord » — une manière de
   * mettre le B2B en tête sans le nommer. Ce critère est mort avec
   * `perLocation` (p-2) : c'est le point de vente qui dit ce qu'il offre. Pour
   * ouvrir par le B2B, on lui donne la position 0 à l'écran des contextes —
   * une donnée qu'on corrige, plutôt qu'une déduction que personne ne voyait.
   */
  it('suit l’ordre du registre', () => {
    const store = setup();
    withFamily(store);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.inherit-row dt')]
      .map((cell) => cell.textContent?.trim() ?? '')
      .filter((label) => label !== '');
    expect(labels).toEqual(['À emporter', 'Sur place', 'B2B']);
  });

  it('sépare le CHIFFRE du nom du régime', () => {
    // « TVA Réduit · 5,5 % » peignait les deux du même poids, et le chiffre
    // qu'on cherche se perdait au bout de la phrase.
    const store = setup();
    withFamily(store);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();
    const rate = (fixture.nativeElement as HTMLElement).querySelector('.inherit-rate');
    // La première ligne est « À emporter » depuis que l'ordre suit le registre.
    expect(rate?.querySelector('strong')?.textContent?.trim()).toBe('5,5 %');
    expect(rate?.querySelector('.inherit-regime')?.textContent?.trim()).toBe('Réduit');
  });
});

describe('PricingForm — la dérogation de la fiche', () => {
  it('affiche le taux de la FICHE, marqué comme redéfini', () => {
    // La règle de résolution, à l'écran comme au serveur : la fiche d'abord, sa
    // famille ensuite — contexte par contexte.
    const store = setup();
    withFamily(store);
    store.vatOverride.set({ b2b: 'tva_55' });
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const b2b = [...host.querySelectorAll('.inherit-row')].find((row) =>
      row.querySelector('dt')?.textContent?.includes('B2B'),
    );
    expect(b2b?.textContent).toContain('5,5 %');
    expect(b2b?.textContent).toContain('Redéfini');
    expect(b2b?.classList.contains('is-overridden')).toBe(true);
  });

  it('laisse les autres contextes à leur famille', () => {
    // Déroger en B2B ne déroge nulle part ailleurs : c'est ce qui rend la
    // dérogation utilisable sans avoir à tout redéclarer.
    const store = setup();
    withFamily(store);
    store.vatOverride.set({ b2b: 'tva_55' });
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const emporter = [...host.querySelectorAll('.inherit-row')].find((row) =>
      row.querySelector('dt')?.textContent?.includes('À emporter'),
    );
    expect(emporter?.textContent).toContain('5,5 %');
    expect(emporter?.textContent).not.toContain('Redéfini');
  });
});

/** Régression : jusqu'au 2026-10-15, un contexte non vendu cachait son taux. */
describe('PricingForm — la TVA de chaque contexte', () => {
  it('montre et laisse régler le taux de chaque contexte en service', () => {
    const store = setup();
    withFamily(store);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    const emporter = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('.inherit-row'),
    ].find((row) => row.querySelector('dt')?.textContent?.includes('À emporter'));

    expect(emporter?.textContent).toContain('5,5 %');
    expect(emporter?.textContent).not.toContain('non proposé');
    expect(emporter?.querySelector('fold-button-icon')).not.toBeNull();
  });
});

describe('PricingForm — ce qui n’y est PAS', () => {
  it('ne porte plus le poids : il appartient à la déclaration nutritionnelle', () => {
    const store = setup();
    store.weightGrams.set(220);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Poids');
  });
});

describe('PricingForm — le HT par canal', () => {
  /**
   * **Le cœur de l'ancrage.** Un seul prix d'étiquette, deux taux, deux hors
   * taxe : 10,00 € TTC valent 9,48 € HT au comptoir (5,5 %). La ligne B2B, elle,
   * montre le prix pro HT SAISI — seule source depuis le lot R3.
   */
  it('déduit le HT de chaque contexte public, et montre le HT saisi en B2B', () => {
    const store = setup();
    withFamily(store);
    store.priceEur.set(10);
    store.proPriceHtText.set('8,5');
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.inherit-row')];
    const net = (label: string): string =>
      rows
        .find((row) => row.querySelector('dt')?.textContent?.includes(label))
        ?.querySelector('.inherit-gross strong')
        ?.textContent?.replace(/\u202f|\u00a0/g, ' ')
        .trim() ?? '';

    expect(net('À emporter')).toBe('9,48 €');
    expect(net('B2B')).toBe('8,50 €');

    // Le montant est ÉTIQUETÉ : seul, « 8,50 € » se lirait aussi bien comme le
    // prix saisi plus haut.
    const rate = rows.find((row) => row.querySelector('dt')?.textContent?.includes('B2B'));
    expect(rate?.querySelector('.inherit-gross')?.textContent).toContain('HT');
  });

  /**
   * La colonne dit toujours l'INVERSE de ce qu'on saisit, sinon elle n'apprend
   * rien. On saisit un prix public TTC, elle montre donc des hors taxe.
   */
  it('étiquette « HT » et jamais « TTC » : le sens de lecture est unique', () => {
    const store = setup();
    withFamily(store);
    store.priceEur.set(10);
    store.proPriceHtText.set('8,5');
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    const cells = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.inherit-gross')];
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((cell) => (cell.textContent ?? '').includes('HT'))).toBe(true);
    expect(cells.some((cell) => (cell.textContent ?? '').includes('TTC'))).toBe(false);
  });

  it('ne montre RIEN sans prix — jamais un montant dérivé de zéro', () => {
    // Un produit non tarifé afficherait « 0,00 € » si on calculait sur `null`,
    // et un zéro se lit comme un prix.
    const store = setup();
    withFamily(store);
    store.priceEur.set(null);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    const gross = (fixture.nativeElement as HTMLElement).querySelector('.inherit-gross');
    expect(gross?.textContent?.trim()).toBe('—');
  });
});

/** Le prix pro HT saisi, sous le prix public — seule source depuis le lot R3. */
describe('PricingForm — le prix pro HT saisi', () => {
  function priced(store: ProductFormStore): void {
    withFamily(store);
    store.priceEur.set(12);
  }

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const flat = (text: string | null | undefined): string =>
    (text ?? '').replace(/\u202f|\u00a0/g, ' ');

  it('offre le champ « Prix pro HT », et la saisie remonte au store en texte', () => {
    const store = setup();
    priced(store);
    const host = render();

    expect(host.textContent).toContain('Prix pro HT');
    const input = host.querySelector<HTMLInputElement>('.field-money-ht input');
    if (input === null) {
      throw new TypeError('champ « Prix pro HT » absent');
    }
    input.value = '8,12345';
    input.dispatchEvent(new Event('input'));

    expect(store.proPriceHtText()).toBe('8,12345');
    expect(store.proPriceMillicents()).toBe(812_345);
  });

  it('montre le TTC de la saisie et son HT', () => {
    const store = setup();
    priced(store);
    // 8,50000 € HT × 1,20 = 10,20 € TTC.
    store.proPriceHtText.set('8,5');
    const host = render();

    const pro = flat(host.querySelector('.pro')?.textContent);
    expect(pro).toContain('10,20 €');
    expect(pro).toContain('8,50 €');
  });

  /**
   * Régression (lot R3, 2026-10-27) : la fiche disait « Dérivé du prix public
   * par la remise posée dans Règles comptables », portait la remise en
   * pastille, et l'indice du champ disait « Vide : le prix pro suit la remise ».
   * Il n'y a plus de remise : rien de tout ça ne doit reparaître.
   */
  it('ne parle plus ni de remise, ni de règles comptables, ni d’écart', () => {
    const store = setup();
    priced(store);
    store.proPriceHtText.set('8,5');
    const host = render();

    const text = flat(host.textContent);
    expect(text).not.toContain('Règles comptables');
    expect(text).not.toContain('remise');
    expect(text).not.toContain('écart');
    expect(host.querySelector('.pro-badge')).toBeNull();
  });

  /** L'invariant de l'écran : le HT B2B du tableau est celui du bloc « Prix pro ». */
  it('la ligne B2B du tableau montre le HT saisi, pas un HT redérivé', () => {
    const store = setup();
    priced(store);
    // 8,336 € HT s'affiche 8,34 € ; re-taxé à 20 % (10,00 € TTC) puis
    // redivisé, on tomberait sur 8,33 € — un centime que la facture dément.
    store.proPriceHtText.set('8,336');
    const host = render();

    const b2b = [...host.querySelectorAll('.inherit-row')].find((row) =>
      row.querySelector('dt')?.textContent?.includes('B2B'),
    );
    expect(flat(b2b?.querySelector('.inherit-gross strong')?.textContent)).toBe('8,34 €');
    expect(flat(host.querySelector('.pro')?.textContent)).toContain('8,34 €');
  });

  /** Le montant seul ne dit pas qu'il n'est pas le prix public. La ligne le dit. */
  it('marque la ligne B2B, et elle seule', () => {
    const store = setup();
    priced(store);
    store.proPriceHtText.set('8,5');
    const host = render();

    const rows = [...host.querySelectorAll('.inherit-row')];
    const marked = rows.filter((row) => row.querySelector('.inherit-discounted') !== null);

    expect(marked).toHaveLength(1);
    expect(marked[0]?.querySelector('dt')?.textContent).toContain('B2B');
  });

  it('sans saisie, dit que la déclinaison n’est pas vendue aux pros', () => {
    const store = setup();
    priced(store);
    const host = render();

    expect(host.querySelector('.pro')).toBeNull();
    expect(host.textContent).toContain('n’est pas vendue aux');
  });
});

/**
 * Régression : la fiche proposait « Suggéré : X € HT (rapport de 90 %) » et un
 * bouton « Reprendre », tirés du rapport des règles comptables ; le prix pro
 * est désormais toujours saisi, et la suggestion induisait en erreur (Hugo,
 * 2026-10-27).
 */
describe('PricingForm — aucune suggestion de prix pro', () => {
  it('ne suggère aucun prix pro', () => {
    const store = setup();
    withFamily(store);
    store.priceEur.set(12);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).not.toContain('Suggéré');
    expect(
      [...host.querySelectorAll('button')].some((b) => b.textContent?.includes('Reprendre')),
    ).toBe(false);
    expect(store.proPriceHtText()).toBe('');
  });
});

/** K4 (`plan-prix-au-kilo.md`) : deux prix au kilo SAISIS, jamais calculés. */
describe('PricingForm — les prix au kilo saisis', () => {
  function render(): HTMLElement {
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function inputUnder(host: HTMLElement, label: string): HTMLInputElement {
    const field = [...host.querySelectorAll('label.field')].find(
      (candidate) => candidate.querySelector('.field-label')?.textContent?.trim() === label,
    );
    const input = field?.querySelector('input');
    if (input === null || input === undefined) {
      throw new TypeError(`champ « ${label} » absent`);
    }
    return input;
  }

  it('offre les deux champs, chacun sous le prix qu’il accompagne', () => {
    const store = setup();
    withFamily(store);
    const host = render();
    const labels = [...host.querySelectorAll('.field-label')].map((l) => l.textContent?.trim());

    expect(labels.indexOf('Prix au kilo public TTC')).toBe(labels.indexOf('Prix public TTC') + 1);
    expect(labels.indexOf('Prix au kilo pro HT')).toBe(labels.indexOf('Prix pro HT') + 1);
    expect(inputUnder(host, 'Prix au kilo pro HT').getAttribute('inputmode')).toBe('decimal');
  });

  it('la saisie remonte au store, sans rien calculer', () => {
    const store = setup();
    withFamily(store);
    store.priceEur.set(12);
    const host = render();

    const pub = inputUnder(host, 'Prix au kilo public TTC');
    pub.value = '24.8';
    pub.dispatchEvent(new Event('input'));
    const pro = inputUnder(host, 'Prix au kilo pro HT');
    pro.value = '20,12345';
    pro.dispatchEvent(new Event('input'));

    expect(store.publicPricePerKgEur()).toBe(24.8);
    expect(store.proPricePerKgHtText()).toBe('20,12345');
    expect(store.priceEur()).toBe(12);
    expect(store.proPriceHtText()).toBe('');
  });

  it('montre la valeur chargée, et vide reste vide', () => {
    const store = setup();
    withFamily(store);
    store.publicPricePerKgEur.set(14.9);
    const host = render();

    expect(inputUnder(host, 'Prix au kilo public TTC').value).toBe('14.9');
    expect(inputUnder(host, 'Prix au kilo pro HT').value).toBe('');
  });

  it('se grisent avec les prix quand le tarif est aligné', () => {
    const store = setup();
    withFamily(store);
    store.pricingAligned.set(true);
    const host = render();

    const stack = host.querySelector('.stack.is-inherited');
    expect(stack?.contains(inputUnder(host, 'Prix au kilo public TTC'))).toBe(true);
    expect(stack?.contains(inputUnder(host, 'Prix au kilo pro HT'))).toBe(true);
  });
});

/** P1 (`vente-au-poids.md`) : l'unité de vente, son pas et son minimum. */
describe('PricingForm — vendre à la pièce ou au poids', () => {
  function render(): { host: HTMLElement; refresh: () => void } {
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();
    return { host: fixture.nativeElement as HTMLElement, refresh: () => fixture.detectChanges() };
  }

  function labels(host: HTMLElement): string[] {
    return [...host.querySelectorAll('.field-label')].map((l) => l.textContent?.trim() ?? '');
  }

  function segment(host: HTMLElement, text: string): HTMLButtonElement {
    const button = [...host.querySelectorAll('fold-view-toggle button')].find((candidate) =>
      candidate.textContent?.includes(text),
    );
    if (!(button instanceof HTMLButtonElement)) {
      throw new TypeError(`segment « ${text} » absent`);
    }
    return button;
  }

  function inputUnder(host: HTMLElement, label: string): HTMLInputElement {
    const field = [...host.querySelectorAll('label.field')].find(
      (candidate) => candidate.querySelector('.field-label')?.textContent?.trim() === label,
    );
    const input = field?.querySelector('input');
    if (input === null || input === undefined) {
      throw new TypeError(`champ « ${label} » absent`);
    }
    return input;
  }

  it('à la pièce, rien ne change : prix unitaires et prix au kilo informatifs', () => {
    const store = setup();
    withFamily(store);
    const { host } = render();

    expect(labels(host)[0]).toBe('Unité de vente');
    expect(labels(host)).toContain('Prix public TTC');
    expect(labels(host)).toContain('Prix au kilo public TTC');
    expect(labels(host)).not.toContain('Pas de saisie');
  });

  it('la bascule au poids passe les prix au kg, montre le pas et le minimum, masque les prix au kilo', () => {
    const store = setup();
    withFamily(store);
    const { host, refresh } = render();

    segment(host, 'Vendre au poids').click();
    refresh();

    expect(store.saleUnit()).toBe('weight');
    const seen = labels(host);
    expect(seen).toContain('Prix public TTC au kg');
    expect(seen).toContain('Prix pro HT au kg');
    expect(seen).toContain('Pas de saisie');
    expect(seen).toContain('Minimum');
    expect(seen).not.toContain('Prix au kilo public TTC');
    expect(seen).not.toContain('Prix au kilo pro HT');
    expect(host.textContent).toContain('Requis pour activer');
    expect(host.textContent).toContain('pas de minimum');
  });

  it('le pas et le minimum remontent au store', () => {
    const store = setup();
    withFamily(store);
    store.saleUnit.set('weight');
    const { host } = render();

    const step = inputUnder(host, 'Pas de saisie');
    step.value = '100';
    step.dispatchEvent(new Event('input'));
    const min = inputUnder(host, 'Minimum');
    min.value = '250';
    min.dispatchEvent(new Event('input'));

    expect(store.weightStepGrams()).toBe(100);
    expect(store.weightMinGrams()).toBe(250);
  });

  it('déjà publiée : le sélecteur est éteint, et la phrase dit quoi faire', () => {
    const store = setup();
    withFamily(store);
    Object.defineProperty(store, 'saleUnitLocked', { value: signal(true) });
    const { host, refresh } = render();

    expect(segment(host, 'Vendre au poids').disabled).toBe(true);
    expect(segment(host, 'Vendre à la pièce').disabled).toBe(true);
    expect(host.textContent).toContain('Déjà publiée');
    expect(host.textContent).toContain('créez une autre');
    segment(host, 'Vendre au poids').click();
    refresh();
    expect(store.saleUnit()).toBe('piece');
  });

  it('se grise avec les prix quand le tarif est aligné', () => {
    const store = setup();
    withFamily(store);
    store.pricingAligned.set(true);
    const { host } = render();

    expect(host.querySelector('.stack.is-inherited fold-view-toggle')).not.toBeNull();
  });
});
