import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { CatalogAdminItemView } from '@lfd/contracts';

import { NotifyService } from '../../../notify.service';
import { CataloguePage } from '../catalogue-page';
import { CatalogueService } from '../catalogue.service';

/**
 * Ce que ces cas tiennent, et c'est **exactement** ce qui manquait : le geste de
 * prix est **atteignable** et il arrive au serveur avec le bon montant.
 *
 * 🔴 Aucun test n'aurait pu voir le défaut d'origine — le contrôle était peint
 * en blanc sur blanc, donc présent dans le DOM, nommé, cliquable et invisible.
 * Ces cas ne prétendent pas le couvrir : ils couvrent ce qu'un test PEUT tenir,
 * c'est-à-dire que le bouton existe une fois par article, qu'il ouvre un champ,
 * et que ce qui en sort est en millicentimes. La couleur, elle, se tient par le
 * fait que le contrôle est désormais un `foldButton` — donc peint par le
 * système, plus à la main.
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
    b2bPriceMillicents: null,
    effectivePriceMillicents: 170_616,
    vatRatePercent: 5.5,
    // L'étiquette publique, en centimes TTC — 2,25 €, volontairement SANS
    // rapport arithmétique avec le prix pro juste au-dessus : la colonne montre
    // deux prix de deux canaux, et une fixture où l'un se déduirait de l'autre
    // laisserait passer une confusion entre les deux.
    publicTtcCents: 225,
    publicVatRatePercent: 5.5,
    // Aucune décision publique : l'article suit l'étiquette du référentiel.
    decidedPublicTtcCents: null,
    allergens: [],
    allergensIncomplete: false,
    isHidden: false,
    isFeatured: false,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    receivedAt: '2026-09-01T08:00:00.000Z',
    ...over,
  };
}

class FakeCatalogue {
  items: readonly CatalogAdminItemView[] = [item()];
  readonly prices: { sku: string; priceMillicents: number }[] = [];
  readonly aligned: string[] = [];

  list(): Promise<readonly CatalogAdminItemView[]> {
    return Promise.resolve(this.items);
  }
  setPrice(sku: string, priceMillicents: number): Promise<void> {
    this.prices.push({ sku, priceMillicents });
    return Promise.resolve();
  }
  alignOnPim(sku: string): Promise<void> {
    this.aligned.push(sku);
    return Promise.resolve();
  }
  readonly visibility: { sku: string; hidden: boolean }[] = [];
  setVisibility(sku: string, hidden: boolean): Promise<void> {
    this.visibility.push({ sku, hidden });
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

describe('CataloguePage — poser un prix pro', () => {
  it('offre le geste sur un article qui suit encore le PIM', async () => {
    const fixture = await render(new FakeCatalogue());

    expect(button(fixture, 'Poser un prix pro sur Croissant')).toBeDefined();
    expect(text(fixture)).toContain('suit le PIM');
  });

  it('envoie le montant saisi en MILLICENTIMES, pas en euros', async () => {
    const api = new FakeCatalogue();
    const fixture = await render(api);

    button(fixture, 'Poser un prix pro sur Croissant').click();
    fixture.detectChanges();

    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[type="number"]',
    );
    if (input === null) {
      throw new Error("le champ de saisie ne s'est pas ouvert");
    }
    input.value = '1.45';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    button(fixture, 'Enregistrer le prix pro de Croissant').click();
    await fixture.whenStable();

    expect(api.prices).toEqual([{ sku: 'VIE-001-1', priceMillicents: 145_000 }]);
  });

  /**
   * Le serveur refuse un prix égal à celui du PIM ; le dire ici évite un
   * aller-retour pour apprendre une règle que l'écran connaissait déjà.
   */
  it('laisse « Enregistrer » inerte tant que le montant est celui du PIM', async () => {
    const fixture = await render(new FakeCatalogue());

    button(fixture, 'Poser un prix pro sur Croissant').click();
    fixture.detectChanges();

    expect(button(fixture, 'Enregistrer le prix pro de Croissant').disabled).toBe(true);
  });

  it('propose de revenir au PIM sur un article déjà négocié, et pas sur les autres', async () => {
    const api = new FakeCatalogue();
    api.items = [item({ b2bPriceMillicents: 145_000, effectivePriceMillicents: 145_000 })];
    const fixture = await render(api);

    button(fixture, 'Revenir au tarif du PIM pour Croissant').click();
    await fixture.whenStable();

    expect(api.aligned).toEqual(['VIE-001-1']);
  });
});

describe('CataloguePage — les quatre lectures', () => {
  it('compte ce que chaque segment montrerait', async () => {
    const api = new FakeCatalogue();
    api.items = [
      item(),
      item({ sku: 'VIE-002-1', name: 'Pain au chocolat', b2bPriceMillicents: 145_000 }),
      item({ sku: 'VIE-003-1', name: "Patte d'ours", vatRatePercent: null, isFeatured: true }),
      item({ sku: 'VIE-004-1', name: 'Chausson', isHidden: true }),
    ];
    const fixture = await render(api);

    const shown = text(fixture);
    expect(shown).toContain('Tous (4)');
    expect(shown).toContain('À prix pro (1)');
    expect(shown).toContain('En avant (1)');
    expect(shown).toContain('Sans TVA (1)');
    expect(shown).toContain('Masqués (1)');
  });

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
   * dans la colonne TVA, qui a été retirée — elle montrait le taux PRO en
   * laissant croire qu'il valait pour les deux audiences.
   *
   * Le mot devait suivre, et pas disparaître avec elle : la ligne d'un article
   * invendable est TEINTÉE, et une couleur ne dit jamais rien seule. Sans cette
   * assertion, la colonne suivante qu'on retire emporte le mot en silence, et
   * il reste quarante lignes orangées que rien n'explique.
   */
  it("garde l'aveu « invendable » SUR LA LIGNE, pas seulement dans l'encart", async () => {
    const api = new FakeCatalogue();
    api.items = [item({ vatRatePercent: null })];
    const fixture = await render(api);

    expect(cell(fixture, '.identity')).toContain('invendable');
  });
});

describe('CataloguePage — retirer de la vente', () => {
  /**
   * 🔴 Le geste coupe la commande pour tous les clients, et il se prenait d'un
   * clic sec sur le bouton le plus criard de la ligne (`variant="ghost"` ne
   * voulant rien dire pour `foldButton`, il rendait en solide primaire).
   * La confirmation s'ouvre DANS la cellule, comme la pose d'un prix.
   */
  it("n'écrit rien tant que la confirmation n'est pas donnée", async () => {
    const api = new FakeCatalogue();
    const fixture = await render(api);

    button(fixture, 'Masquer Croissant dans la boutique').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.visibility).toEqual([]);
    expect(text(fixture)).toContain('plus aucun client ne pourra le commander');
  });

  it('masque une fois la confirmation donnée', async () => {
    const api = new FakeCatalogue();
    const fixture = await render(api);

    button(fixture, 'Masquer Croissant dans la boutique').click();
    fixture.detectChanges();
    confirmNamed(fixture, 'Masquer');
    await fixture.whenStable();

    expect(api.visibility).toEqual([{ sku: 'VIE-001-1', hidden: true }]);
  });

  /** Réafficher remet en vente : ça se confirme aussi, et le texte change. */
  it('confirme aussi la remise en vente', async () => {
    const api = new FakeCatalogue();
    api.items = [item({ isHidden: true })];
    const fixture = await render(api);

    button(fixture, 'Réafficher Croissant dans la boutique').click();
    fixture.detectChanges();

    expect(text(fixture)).toContain('pourront de nouveau le commander');
    confirmNamed(fixture, 'Réafficher');
    await fixture.whenStable();

    expect(api.visibility).toEqual([{ sku: 'VIE-001-1', hidden: false }]);
  });
});

/** Le bouton de confirmation de `fold-inline-confirm`, nommé par son libellé. */
function confirmNamed(fixture: ComponentFixture<CataloguePage>, label: string): void {
  const found = [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll('fold-inline-confirm button'),
  ].find((candidate) => candidate.textContent?.trim() === label);
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
 * passe pour une remise. C'est une confusion sur de l'argent, dans un écran où
 * l'on pose des prix.
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
