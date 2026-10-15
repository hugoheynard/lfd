import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { provideRouter } from '@angular/router';
import type {
  CatalogAdminItemView,
  PendingReviewView,
  PublishedCatalogView,
  PublishedCellCounts,
  PublishedEntryView,
  PublishedVariantView,
} from '@lfd/contracts';

import { NotifyService } from '../../../notify.service';
import { CataloguePage } from './catalogue-page';
import { CatalogueService, type ShopAudience } from '../catalogue.service';

/**
 * La vue « Catalogue publié » : les prix du référentiel en lecture (lot D,
 * 2026-10-15 — plus aucun geste de prix), les audiences, le masquage et la
 * validation.
 *
 * On passe par le DOM plutôt que par l'instance : les membres sont `protected`,
 * et c'est le gabarit qui câble les colonnes — que `tsc` ne lit pas.
 */

function item(over: Partial<CatalogAdminItemView> = {}): CatalogAdminItemView {
  return {
    sku: 'VIE-001-1',
    productSku: 'VIE-001',
    name: 'Croissant',
    categoryId: 'cat_vien',
    categoryName: 'Viennoiseries',
    pimPriceMillicents: 170_616,
    vatRatePercent: 5.5,
    // L'étiquette publique, en centimes TTC — 2,25 €, volontairement SANS
    // rapport arithmétique avec le prix pro juste au-dessus : la colonne montre
    // deux prix de deux canaux, et une fixture où l'un se déduirait de l'autre
    // laisserait passer une confusion entre les deux.
    publicTtcCents: 225,
    publicVatRatePercent: 5.5,
    allergens: [],
    allergensIncomplete: false,
    isHidden: false,
    isHiddenPublic: false,
    publicReviewPending: false,
    proReviewPending: false,
    audience: null,
    isFeatured: false,
    operationOnly: false,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    receivedAt: '2026-09-01T08:00:00.000Z',
    ...over,
  };
}

const NO_COUNTS: PublishedCellCounts = {
  inactif: 0,
  en_vente: 0,
  masque: 0,
  pas_vendu: 0,
  en_attente_validation: 0,
  incomplet: 0,
};

/** Une déclinaison EN VENTE aux deux audiences — le cas courant. */
function variantView(over: Partial<PublishedVariantView> = {}): PublishedVariantView {
  return {
    sku: 'VIE-001-1',
    name: 'Croissant',
    onSale: true,
    isDefault: true,
    gaps: [],
    reviewPending: { pro: false, public: false },
    pro: { state: 'en_vente', htMillicents: 170_616 },
    public: { state: 'en_vente', ttcCents: 225 },
    ...over,
  };
}

function entry(over: Partial<PublishedEntryView> = {}): PublishedEntryView {
  return {
    productId: 'prd_vie_001',
    productSku: 'VIE-001',
    name: 'Croissant',
    categoryId: 'cat_vien',
    status: 'active',
    audience: 'both',
    audienceInherited: true,
    familyAudience: 'both',
    variants: [variantView()],
    receivedAt: '2026-09-01T08:00:00.000Z',
    ...over,
  };
}

/**
 * La vue publiée qui va avec des lignes en vente : une fiche par article, son
 * SKU et son nom repris. C'est la forme que le serveur rend pour un catalogue
 * où tout se vend — les cas qui s'en écartent posent `published` eux-mêmes.
 */
function viewOf(items: readonly CatalogAdminItemView[]): PublishedCatalogView {
  return {
    shelves: [
      {
        categoryId: 'cat_vien',
        name: 'Viennoiseries',
        position: 0,
        withdrawn: false,
        pro: { ...NO_COUNTS, en_vente: items.length },
        public: { ...NO_COUNTS, en_vente: items.length },
      },
    ],
    entries: items.map((one) =>
      entry({
        productId: `prd_${one.sku}`,
        productSku: one.productSku,
        name: one.name,
        variants: [variantView({ sku: one.sku, name: one.name })],
      }),
    ),
    pendingReview: [],
  };
}

class FakeCatalogue {
  items: readonly CatalogAdminItemView[] = [item()];
  /** `null` = dérivée des lignes en vente (`viewOf`). */
  view: PublishedCatalogView | null = null;

  list(): Promise<readonly CatalogAdminItemView[]> {
    return Promise.resolve(this.items);
  }
  published(): Promise<PublishedCatalogView> {
    return Promise.resolve(this.view ?? viewOf(this.items));
  }
  /** Ce que la route unique `/masking` a reçu. */
  readonly masking: { sku: string; audience: ShopAudience; hidden: boolean }[] = [];
  setMasking(sku: string, audience: ShopAudience, hidden: boolean): Promise<void> {
    this.masking.push({ sku, audience, hidden });
    return Promise.resolve();
  }

  readonly approvals: { skus: readonly string[]; audiences: readonly ShopAudience[] }[] = [];
  approveReview(skus: readonly string[], audiences: readonly ShopAudience[]): Promise<void> {
    this.approvals.push({ skus, audiences });
    return Promise.resolve();
  }
}

class FakeNotify {
  readonly successes: string[] = [];
  success(message: string): void {
    this.successes.push(message);
  }
  error(): void {}
  refused(): void {}
}

async function render(api: FakeCatalogue) {
  TestBed.configureTestingModule({
    imports: [CataloguePage],
    providers: [
      provideRouter([]),
      { provide: CatalogueService, useValue: api },
      { provide: NotifyService, useValue: new FakeNotify() },
    ],
  });
  const fixture: ComponentFixture<CataloguePage> = TestBed.createComponent(CataloguePage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<CataloguePage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function button(fixture: ComponentFixture<CataloguePage>, label: string): HTMLButtonElement {
  const found = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === label,
  );
  if (found === undefined) {
    throw new Error(`bouton « ${label} » absent de l'écran`);
  }
  return found;
}

/**
 * 🔴 **Plus aucun prix ne se pose ici** (lot D, 2026-10-15) : la plateforme
 * ne décide plus de prix, et la colonne envoie à la fiche du référentiel.
 */
describe('CataloguePage — les prix en lecture', () => {
  it('n’offre aucun geste de prix, ni pro ni public', async () => {
    const fixture = await render(new FakeCatalogue());

    expect(() => button(fixture, 'Poser un prix pro sur Croissant')).toThrow();
    expect(() => button(fixture, 'Poser un prix public sur Croissant')).toThrow();
    expect((fixture.nativeElement as HTMLElement).querySelector('input[type="number"]')).toBeNull();
  });

  it('envoie à la fiche du référentiel pour changer un prix', async () => {
    const fixture = await render(new FakeCatalogue());

    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '.pim a.link',
    );
    expect(link?.textContent).toContain('Changer dans la fiche');
    expect(link?.getAttribute('href')).toBe('/pim/produits/prd_VIE-001-1');
  });
});

describe('CataloguePage — ce qui ne se vend pas', () => {
  /**
   * Un article sans taux entre au catalogue et n'est achetable par personne :
   * l'écran doit le dire, plutôt que de rendre une liste rassurante.
   */
  it('alerte sur les articles que la boutique ne peut pas vendre', async () => {
    const api = new FakeCatalogue();
    api.items = [item({ vatRatePercent: null })];
    const fixture = await render(api);

    expect(text(fixture)).toContain('ne sont pas vendables');
  });

  /**
   * 🔴 **Régression du déménagement du 2026-09-21.** L'aveu « sans taux » vivait
   * dans la colonne TVA, qui a été retirée. La ligne d'un article invendable est
   * TEINTÉE, et une couleur ne dit jamais rien seule.
   */
  it("garde l'aveu « invendable » SUR LA LIGNE, pas seulement dans l'encart", async () => {
    const api = new FakeCatalogue();
    api.items = [item({ vatRatePercent: null })];
    const fixture = await render(api);

    expect(cell(fixture, '.identity')).toContain('invendable');
  });

  /**
   * C'est l'objet du lot 3 : une fiche INACTIVE paraît, grisée, et ses cellules
   * le disent — elle n'a pas de ligne en vente.
   */
  it('montre une fiche inactive, grisée', async () => {
    const api = new FakeCatalogue();
    api.items = [];
    api.view = {
      ...viewOf([]),
      entries: [
        entry({
          status: 'inactive',
          name: 'Brioche',
          variants: [
            variantView({
              sku: 'VIE-009-1',
              name: 'Brioche',
              onSale: false,
              pro: { state: 'inactif', htMillicents: 150_000 },
              public: { state: 'inactif', ttcCents: 190 },
            }),
          ],
        }),
      ],
    };
    const fixture = await render(api);

    expect(text(fixture)).toContain('Brioche');
    expect(fixture.nativeElement.querySelector('.identity.is-inactive')).not.toBeNull();
    expect(text(fixture)).toContain('inactive');
    expect(text(fixture)).toContain('pas en vente');
  });
});

describe('CataloguePage — la colonne Audience', () => {
  it('dit l’audience et d’où elle vient — famille ou fiche', async () => {
    const api = new FakeCatalogue();
    api.view = {
      ...viewOf(api.items),
      entries: [entry({ audience: 'pro', audienceInherited: false })],
    };
    const fixture = await render(api);

    expect(cell(fixture, '.audience-cell')).toContain('Pros');
    expect(cell(fixture, '.audience-cell')).toContain('fiche');
  });

  it('ne dit rien de l’origine sur un fait d’avant le lot 3', async () => {
    const api = new FakeCatalogue();
    api.view = { ...viewOf(api.items), entries: [entry({ audienceInherited: null })] };
    const fixture = await render(api);

    const audience = cell(fixture, '.audience-cell');
    expect(audience).toContain('Pros et public');
    expect(audience).not.toContain('famille');
    expect(audience).not.toContain('fiche');
  });
});

describe('CataloguePage — masquer, par la route unique', () => {
  /**
   * 🔴 Le geste coupe la commande pour une audience : il se confirme DANS la
   * cellule, et rien ne part avant.
   */
  it("n'écrit rien tant que la confirmation n'est pas donnée", async () => {
    const api = new FakeCatalogue();
    const fixture = await render(api);

    button(fixture, 'Masquer Croissant aux pros').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.masking).toEqual([]);
    expect(text(fixture)).toContain('boutique PROFESSIONNELLE');
    expect(text(fixture)).toContain('boutique publique n’est pas touchée');
  });

  it('masque aux pros sur `/masking`, audience « pro »', async () => {
    const api = new FakeCatalogue();
    const fixture = await render(api);

    button(fixture, 'Masquer Croissant aux pros').click();
    fixture.detectChanges();
    confirmNamed(fixture, 'Masquer');
    await fixture.whenStable();

    expect(api.masking).toEqual([{ sku: 'VIE-001-1', audience: 'pro', hidden: true }]);
  });

  /**
   * 🔴 **Les deux cellules ne touchent pas la même audience** — sans ce cas,
   * brancher les deux sur la même valeur passerait au vert.
   */
  it('🔴 masque au PUBLIC par la même route, avec l’audience « public »', async () => {
    const api = new FakeCatalogue();
    const fixture = await render(api);

    button(fixture, 'Masquer Croissant au public').click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('boutique PUBLIQUE');
    confirmNamed(fixture, 'Masquer');
    await fixture.whenStable();

    expect(api.masking).toEqual([{ sku: 'VIE-001-1', audience: 'public', hidden: true }]);
  });

  it('réaffiche une cellule masquée', async () => {
    const api = new FakeCatalogue();
    api.view = {
      ...viewOf(api.items),
      entries: [
        entry({ variants: [variantView({ pro: { state: 'masque', htMillicents: 170_616 } })] }),
      ],
    };
    const fixture = await render(api);

    button(fixture, 'Afficher Croissant aux pros').click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('revient dans la boutique PROFESSIONNELLE');
    confirmNamed(fixture, 'Afficher');
    await fixture.whenStable();

    expect(api.masking).toEqual([{ sku: 'VIE-001-1', audience: 'pro', hidden: false }]);
  });
});

describe('CataloguePage — le filtre', () => {
  function mixed(api: FakeCatalogue): void {
    api.items = [];
    api.view = {
      ...viewOf([]),
      entries: [
        entry({
          name: 'Croissant',
          variants: [variantView({ sku: 'A-1', name: 'Croissant' })],
        }),
        entry({
          productId: 'prd_b',
          name: 'Pain',
          variants: [
            variantView({
              sku: 'B-1',
              name: 'Pain',
              pro: { state: 'pas_vendu', htMillicents: null },
              public: { state: 'masque', ttcCents: 300 },
            }),
          ],
        }),
        entry({
          productId: 'prd_c',
          name: 'Chausson',
          variants: [
            variantView({
              sku: 'C-1',
              name: 'Chausson',
              pro: { state: 'en_vente', htMillicents: 100_000 },
              public: { state: 'en_attente_validation', ttcCents: 150 },
            }),
          ],
        }),
        entry({
          productId: 'prd_d',
          name: 'Brioche',
          status: 'inactive',
          variants: [
            variantView({
              sku: 'D-1',
              name: 'Brioche',
              pro: { state: 'inactif', htMillicents: null },
              public: { state: 'inactif', ttcCents: null },
            }),
          ],
        }),
      ],
    };
  }

  it('compte ce que chaque lecture montrerait', async () => {
    const api = new FakeCatalogue();
    mixed(api);
    const shown = text(await render(api));

    expect(shown).toContain('Tout (4)');
    expect(shown).toContain('Vu des pros (2)');
    expect(shown).toContain('Vu du public (1)');
    expect(shown).toContain('Masqué (1)');
    expect(shown).toContain('En attente (1)');
    expect(shown).toContain('Inactif (1)');
  });

  it('« vu du public » ne garde que ce que le public voit vraiment', async () => {
    const api = new FakeCatalogue();
    mixed(api);
    const fixture = await render(api);

    // Le filtre par sa méthode : `fold-view-toggle` rend des boutons dont le
    // libellé porte le compte, et c'est la règle qu'on éprouve, pas le clic.
    fixture.componentInstance['selectFilter']('public');
    fixture.detectChanges();

    const names = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('.identity .name'),
    ].map((node) => node.textContent?.trim());
    expect(names).toEqual(['Croissant']);
  });
});

describe('CataloguePage — les états de cellule', () => {
  function single(variant: PublishedVariantView, status: PublishedEntryView['status'] = 'active') {
    const api = new FakeCatalogue();
    api.items = [];
    api.view = { ...viewOf([]), entries: [entry({ status, variants: [variant] })] };
    return api;
  }

  it('« pas vendu » : une lecture, avec un lien vers la fiche, sans interrupteur', async () => {
    const fixture = await render(
      single(variantView({ pro: { state: 'pas_vendu', htMillicents: null } })),
    );

    expect(text(fixture)).toContain('pas vendu aux pros');
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'app-published-cell a',
    );
    expect(link?.getAttribute('href')).toBe('/pim/produits/prd_vie_001');
    expect(() => button(fixture, 'Masquer Croissant aux pros')).toThrow();
  });

  it('« incomplet » : dit ce qui manque, en mots', async () => {
    const fixture = await render(
      single(
        variantView({
          gaps: ['price', 'vat:b2b'],
          pro: { state: 'incomplet', htMillicents: null },
          public: { state: 'incomplet', ttcCents: null },
        }),
      ),
    );

    expect(text(fixture)).toContain('manque : prix, taux de TVA « b2b »');
    expect(() => button(fixture, 'Masquer Croissant au public')).toThrow();
  });

  it('« en attente » : la cellule le dit, sans interrupteur', async () => {
    const fixture = await render(
      single(variantView({ public: { state: 'en_attente_validation', ttcCents: 225 } })),
    );

    expect(text(fixture)).toContain('en attente de validation');
    expect(() => button(fixture, 'Masquer Croissant au public')).toThrow();
  });

  it('« en vente » : le prix servi, avec son unité', async () => {
    const fixture = await render(single(variantView()));

    const cells = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('app-published-cell'),
    ].map((node) => (node.textContent ?? '').replace(/\s/gu, ' '));
    expect(cells[0]).toContain('1,70616 € HT');
    expect(cells[1]).toContain('2,25 € TTC');
  });
});

describe('CataloguePage — la validation des arrivées', () => {
  function pendingOf(over: Partial<PendingReviewView> = {}): PendingReviewView {
    return {
      sku: 'VIE-001-1',
      productId: 'prd_vie_001',
      productSku: 'VIE-001',
      name: 'Croissant',
      categoryId: 'cat_vien',
      audiences: ['pro', 'public'],
      receivedAt: '2026-09-01T08:00:00.000Z',
      ...over,
    };
  }

  it('ne montre aucun callout quand rien n’attend', async () => {
    const fixture = await render(new FakeCatalogue());
    expect((fixture.nativeElement as HTMLElement).querySelector('app-review-callout')).toBeNull();
  });

  it('annonce les arrivées et valide UNE ligne pour une audience', async () => {
    const api = new FakeCatalogue();
    api.view = {
      ...viewOf(api.items),
      pendingReview: [
        pendingOf(),
        pendingOf({ sku: 'VIE-002-1', name: 'Pain au chocolat', audiences: ['public'] }),
      ],
    };
    const fixture = await render(api);

    expect(text(fixture)).toContain('2 nouveaux articles attendent votre validation');
    expect(() => button(fixture, 'Valider pour les pros : Pain au chocolat')).toThrow();

    button(fixture, 'Valider pour la boutique : Croissant').click();
    await fixture.whenStable();

    expect(api.approvals).toEqual([{ skus: ['VIE-001-1'], audiences: ['public'] }]);
  });

  it('« Tout valider » envoie toute la liste, pour les deux audiences', async () => {
    const api = new FakeCatalogue();
    api.view = {
      ...viewOf(api.items),
      pendingReview: [pendingOf(), pendingOf({ sku: 'VIE-002-1', audiences: ['pro'] })],
    };
    const fixture = await render(api);

    const all = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === 'Tout valider',
    );
    all?.click();
    await fixture.whenStable();

    expect(api.approvals).toEqual([
      { skus: ['VIE-001-1', 'VIE-002-1'], audiences: ['pro', 'public'] },
    ]);
  });
});

/** Le bouton de confirmation de `fold-inline-confirm`, nommé par son libellé. */
function confirmNamed(fixture: ComponentFixture<CataloguePage>, label: string): void {
  const found = [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll('fold-inline-confirm button'),
    // Les déclencheurs portent un `aria-label` qui nomme l'article ; le bouton
    // de confirmation, non. Sans ce tri, « Masquer » trouverait le déclencheur
    // de la PREMIÈRE cellule — celle des pros — quel que soit le geste ouvert.
  ].find(
    (candidate) => candidate.textContent?.trim() === label && !candidate.hasAttribute('aria-label'),
  );
  if (found === undefined) {
    throw new Error(`confirmation « ${label} » absente`);
  }
  found.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/**
 * **La colonne du référentiel porte DEUX prix**, et deux unités (Hugo,
 * 2026-09-21).
 *
 * 🔴 Ce que ces cas tiennent et qu'aucun autre ne peut tenir : les mots « HT »
 * et « TTC » sont à l'écran. Un HT pro et un TTC public l'un sous l'autre, sans
 * leur unité, se lisent comme deux versions du même prix — et l'écart entre eux
 * passe pour une remise. C'est une confusion sur de l'argent.
 */
describe('CataloguePage — les deux prix du référentiel', () => {
  it('montre le pro en HT et le public en TTC, chacun avec son unité', async () => {
    const api = new FakeCatalogue();
    const fixture = await render(api);

    const pim = cell(fixture, '.pim');
    // ⚠️ **Les deux précisions diffèrent, et c'est juste.** Le pro est un HT
    // DÉRIVÉ : il porte ses millicentimes jusqu'au bout (`1,70616 €`), parce
    // que les tronquer ici donnerait un prix que la caisse ne facture pas. Le
    // public est l'étiquette TTC qu'un humain a tapée — elle n'a que des
    // centimes à montrer. Une colonne qui les arrondirait pareil effacerait
    // précisément la différence que cette colonne existe pour dire.
    expect(pim).toContain('1,70616 € HT');
    expect(pim).toContain('2,25 € TTC');
  });

  /**
   * Un article sans étiquette publique n'est pas un article à zéro euro : c'est
   * un article que la vitrine publique ÉCARTE. Un tiret le dirait comme une
   * absence de donnée ; le mot dit une conséquence.
   */
  it('dit « non poussé » plutôt que rien quand le référentiel n’a pas d’étiquette', async () => {
    const api = new FakeCatalogue();
    api.items = [item({ publicTtcCents: null, publicVatRatePercent: null })];
    const fixture = await render(api);

    const pim = cell(fixture, '.pim');
    expect(pim).toContain('non poussé');
    expect(pim).not.toContain('TTC');
  });
});

/**
 * Le texte de la première cellule qui porte cette classe, **espaces
 * normalisés**.
 *
 * ⚠️ `Intl.NumberFormat` en français sépare le montant de son symbole par une
 * **fine insécable** (U+202F), pas par une espace. Une assertion écrite au
 * clavier ne peut donc pas correspondre, et le test échoue sur une différence
 * invisible à la lecture. Normaliser ici vaut mieux que de découper l'attente
 * en morceaux : « 1,70616 » et « HT » présents séparément ne diraient pas
 * qu'ils sont sur la MÊME ligne.
 */
function cell(fixture: ComponentFixture<CataloguePage>, selector: string): string {
  const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
  if (found === null) {
    throw new Error(`cellule « ${selector} » absente de la ligne`);
  }
  return (found.textContent ?? '').replace(/\s/gu, ' ');
}

/**
 * **L'étiquette publique, et le nombre qu'elle ajoute.**
 *
 * 🔴 Ce que ces cas tiennent et qui n'existe nulle part ailleurs : l'écart
 * entre l'étiquette et le prix ENCAISSÉ est écrit à l'écran. C'est la
 * contrepartie de la décision d'ancre — on assume qu'un TTC puisse revenir un
 * centime plus haut, donc on le dit.
 */
describe('CataloguePage — le prix public encaissé', () => {
  /**
   * 🔴 **Le nombre qui dit la vérité sur l'arrondi.** 2,25 € TTC à 5,5 % font
   * 213 270 millicentimes hors taxe, qui refacturés rendent 2,25 € : les deux
   * coïncident, donc la ligne ne s'affiche pas. Répéter le même montant
   * apprendrait à ne plus le lire.
   */
  it("ne répète pas l'encaissé quand il vaut l'étiquette", async () => {
    const api = new FakeCatalogue();
    const fixture = await render(api);

    expect(text(fixture)).not.toContain('encaissé');
  });

  /**
   * 🔴 **Et il s'affiche dès que les deux divergent.** 1,05 € à 5,5 % revient à
   * 1,06 € — mesuré dans `ancrage-du-ttc-pose.mjs`, et c'est précisément le cas
   * que cette colonne existe pour ne pas laisser découvrir en caisse.
   */
  it('🔴 annonce l’encaissé quand l’aller-retour ajoute un centime', async () => {
    const api = new FakeCatalogue();
    api.items = [item({ publicTtcCents: 105, publicVatRatePercent: 5.5 })];
    const fixture = await render(api);

    expect(text(fixture)).toContain('encaissé');
    expect(text(fixture)).toContain('1,06');
  });
});
