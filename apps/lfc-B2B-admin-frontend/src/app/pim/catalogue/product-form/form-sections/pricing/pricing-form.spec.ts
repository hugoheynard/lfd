import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../../product-form-store';
import { provideTestSalesContexts } from '../../../sales-contexts/sales-context-store.testing';
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
        { locationId: 'emp_rivoli', context: 'takeaway' },
        { locationId: null, context: 'b2b' },
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
  it('demande un prix HT — le TTC dépend du mode, il se calcule', () => {
    setup();
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Prix HT');
    expect(text).not.toContain('TTC');
  });

  it('montre le régime À CÔTÉ du prix, pas dans une autre section', () => {
    // « 24,50 » et « TVA 5,5 % » sont une seule information : ce qu'on facture.
    // Les séparer obligeait à replier une section pour en déplier une autre.
    const store = setup();
    withFamily(store);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Prix HT');
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
    store.channelsOverride.set([{ locationId: null, context: 'b2b' }]);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('redéfinis pour cette fiche');
    expect(text).not.toContain('Hérité de la famille');
  });

  it('ouvre par le B2B — le comptoir est le cas particulier ici', () => {
    const store = setup();
    withFamily(store);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.inherit-row dt')]
      .map((cell) => cell.textContent?.trim() ?? '')
      .filter((label) => label !== '');
    expect(labels[0]).toBe('B2B');
    expect(labels).toEqual(['B2B', 'À emporter', 'Sur place']);
  });

  it('sépare le CHIFFRE du nom du régime', () => {
    // « TVA Réduit · 5,5 % » peignait les deux du même poids, et le chiffre
    // qu'on cherche se perdait au bout de la phrase.
    const store = setup();
    withFamily(store);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();
    const rate = (fixture.nativeElement as HTMLElement).querySelector('.inherit-rate');
    expect(rate?.querySelector('strong')?.textContent?.trim()).toBe('20 %');
    expect(rate?.querySelector('.inherit-regime')?.textContent?.trim()).toBe('Normal');
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
    store.channelsOverride.set([{ locationId: null, context: 'b2b' }]);
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

describe('PricingForm — le TTC par canal', () => {
  it('calcule le TTC de CHAQUE contexte à partir du prix HT et de son taux', () => {
    // La famille est à 5,5 % au comptoir et 20 % en B2B : deux TTC pour un seul
    // prix HT. C'est exactement ce que la colonne existe pour montrer — sans
    // elle, il faut faire le calcul de tête pour savoir ce que paie le client.
    const store = setup();
    withFamily(store);
    store.priceEur.set(10);
    const fixture = TestBed.createComponent(PricingForm);
    fixture.detectChanges();

    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.inherit-row')];
    const gross = (label: string): string =>
      rows
        .find((row) => row.querySelector('dt')?.textContent?.includes(label))
        ?.querySelector('.inherit-gross strong')
        ?.textContent?.replace(/\u202f|\u00a0/g, ' ')
        .trim() ?? '';

    expect(gross('À emporter')).toBe('10,55 €');
    expect(gross('B2B')).toBe('12,00 €');

    // Le montant est ÉTIQUETÉ : seul, « 12,00 € » se lirait aussi bien comme le
    // prix HT saisi plus haut.
    const rate = rows.find((row) => row.querySelector('dt')?.textContent?.includes('B2B'));
    expect(rate?.querySelector('.inherit-gross')?.textContent).toContain('TTC');
  });

  it('ne montre RIEN sans prix — jamais un TTC égal au HT', () => {
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
