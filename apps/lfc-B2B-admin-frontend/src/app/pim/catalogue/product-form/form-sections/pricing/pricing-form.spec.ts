import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { AccountingRulesStore } from '../../../../accounting-rules/accounting-rules.store';
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
      channelPreset: [
        { pointOfSaleId: 'emp_rivoli', context: 'takeaway' },
        { pointOfSaleId: 'pos_b2b', context: 'b2b' },
      ],
      vatByContext: { takeaway: 'tva_55', eatIn: 'tva_55', b2b: 'tva_20' },
      activeProductCount: 0,
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

  it('offre de REDÉFINIR les canaux — la fiche peut ne pas suivre sa famille', () => {
    // Ce test disait l'inverse : « n'offre pas de Redéfinir, l'API neutralise
    // l'override ». Il avait raison tant que rien ne portait la décision. Ce
    // n'est plus le cas — et un écran qui refuse un geste que le serveur accepte
    // est aussi faux que l'inverse.
    const store = setup();
    withFamily(store);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Redéfinir les canaux');
  });

  it('dit que les canaux sont redéfinis, plutôt que de parler d’héritage', () => {
    const store = setup();
    withFamily(store);
    store.channelsOverride.set([{ pointOfSaleId: 'pos_b2b', context: 'b2b' }]);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('redéfinis pour cette fiche');
    expect(text).not.toContain('Hérité de la famille');
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

describe('PricingForm — la fiche qui ne suit plus sa famille', () => {
  it('lit les LIGNES sur la matrice de la fiche', () => {
    // La famille vend au comptoir ET en B2B ; cette fiche-là ne se vend qu'aux
    // pros. Sans résolution, l'encadré afficherait des boutiques où elle n'est
    // pas vendue — et un taux pour un canal qu'elle a fermé.
    const store = setup();
    withFamily(store);
    store.channelsOverride.set([{ pointOfSaleId: 'pos_b2b', context: 'b2b' }]);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.inherit-row')];
    const emporter = rows.find((row) =>
      row.querySelector('dt')?.textContent?.includes('À emporter'),
    );
    const b2b = rows.find((row) => row.querySelector('dt')?.textContent?.includes('B2B'));

    expect(emporter?.textContent).toContain('non proposé');
    expect(b2b?.textContent).toContain('20 %');
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
   * taxe : 10,00 € TTC valent 9,48 € HT au comptoir (5,5 %) et 8,33 € HT en
   * B2B (20 %). Sans cette colonne, il faut faire le calcul de tête pour savoir
   * ce que la maison encaisse vraiment.
   */
  it('déduit le HT de CHAQUE contexte du prix public et de son taux', () => {
    const store = setup();
    withFamily(store);
    store.priceEur.set(10);
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
    // Aucune remise réglée dans ce cas-là : la ligne B2B part du prix public.
    expect(net('B2B')).toBe('8,33 €');

    // Le montant est ÉTIQUETÉ : seul, « 8,33 € » se lirait aussi bien comme le
    // prix saisi plus haut.
    const rate = rows.find((row) => row.querySelector('dt')?.textContent?.includes('B2B'));
    expect(rate?.querySelector('.inherit-gross')?.textContent).toContain('HT');
  });

  /**
   * La colonne dit toujours l'INVERSE de ce qu'on saisit, sinon elle n'apprend
   * rien. On saisit un prix public TTC, elle montre donc des hors taxe — et
   * c'est désormais son seul mode : le sens inverse a disparu avec l'assiette.
   */
  it('étiquette « HT » et jamais « TTC » : le sens de lecture est unique', () => {
    const store = setup();
    withFamily(store);
    store.priceEur.set(10);
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

describe('PricingForm — le prix professionnel', () => {
  /** Le rapport tel que les règles comptables le rendent : −10 %. */
  function withProRatio(store: ProductFormStore, ratioBp: number | null): void {
    const rules = TestBed.inject(AccountingRulesStore);
    vi.spyOn(rules, 'rules').mockReturnValue({ ratioBp, updatedAt: null });
    withFamily(store);
    store.priceEur.set(12);
  }

  /**
   * La chaîne entière, telle qu'on la lit à l'écran : 12,00 € public TTC,
   * −10 % pour les pros, 20 % de TVA sur le contexte B2B.
   */
  it('dérive le prix pro TTC et son HT du prix public', () => {
    const store = setup();
    withProRatio(store, 9_000);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    const pro = (fixture.nativeElement as HTMLElement).querySelector('.pro');
    const text = pro?.textContent?.replace(/\u202f|\u00a0/g, ' ') ?? '';
    // 12,00 € × 90 % = 10,80 € TTC ; ÷ 1,20 = 9,00 € HT.
    expect(text).toContain('10,80 €');
    expect(text).toContain('9,00 €');
  });

  /**
   * La pastille dit d'où vient le montant. Sans elle, « 10,80 € » tombe de
   * nulle part et personne ne sait où aller le changer.
   */
  it('porte la remise en pastille, et renvoie où elle se règle', () => {
    const store = setup();
    withProRatio(store, 9_000);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('−10 %');
    expect(text).toContain('Règles comptables');
  });

  /**
   * Aucun rapport réglé : on le DIT. Un blanc se lirait « ce produit n'a pas de
   * prix pro », alors que c'est le réglage de la maison qui manque.
   */
  it('dit qu’aucune remise n’est réglée plutôt que de laisser un blanc', () => {
    const store = setup();
    withProRatio(store, null);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.pro')).toBeNull();
    expect(host.textContent).toContain('Aucune');
  });
});

describe('PricingForm — la ligne B2B suit le prix remisé', () => {
  /**
   * **L'invariant de l'écran** : le hors taxe B2B du tableau est celui du bloc
   * « Prix pro » juste au-dessus. Faire partir la ligne du prix PUBLIC
   * afficherait deux montants différents pour la même facture, et rien ne
   * dirait lequel sera encaissé.
   */
  it('déduit la ligne B2B du prix pro, pas du prix public', () => {
    const store = setup();
    const rules = TestBed.inject(AccountingRulesStore);
    vi.spyOn(rules, 'rules').mockReturnValue({ ratioBp: 9_000, updatedAt: null });
    withFamily(store);
    store.priceEur.set(12);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const b2b = [...host.querySelectorAll('.inherit-row')].find((row) =>
      row.querySelector('dt')?.textContent?.includes('B2B'),
    );
    const amount = b2b
      ?.querySelector('.inherit-gross strong')
      ?.textContent?.replace(/\u202f|\u00a0/g, ' ');

    // 12,00 € × 90 % = 10,80 € TTC ; ÷ 1,20 (taux B2B) = 9,00 € HT — le même
    // nombre que le bloc « Prix pro ».
    expect(amount).toBe('9,00 €');
    expect(host.querySelector('.pro')?.textContent?.replace(/\u202f|\u00a0/g, ' ')).toContain(
      '9,00 €',
    );
  });

  /** Le montant seul ne dit pas qu'il est remisé. La ligne le dit. */
  it('marque la ligne remisée, et elle seule', () => {
    const store = setup();
    const rules = TestBed.inject(AccountingRulesStore);
    vi.spyOn(rules, 'rules').mockReturnValue({ ratioBp: 9_000, updatedAt: null });
    withFamily(store);
    store.priceEur.set(12);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.inherit-row')];
    const marked = rows.filter((row) => row.querySelector('.inherit-discounted') !== null);

    expect(marked).toHaveLength(1);
    expect(marked[0]?.querySelector('dt')?.textContent).toContain('B2B');
  });
});
