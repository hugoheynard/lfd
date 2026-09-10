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
    allergens: [],
    allergensIncomplete: false,
    isHidden: false,
    isFeatured: false,
    decidedBy: null,
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

describe('CataloguePage — poser un prix B2B', () => {
  it('offre le geste sur un article qui suit encore le PIM', async () => {
    const fixture = await render(new FakeCatalogue());

    expect(button(fixture, 'Poser un prix B2B sur Croissant')).toBeDefined();
    expect(text(fixture)).toContain('suit le PIM');
  });

  it('envoie le montant saisi en MILLICENTIMES, pas en euros', async () => {
    const api = new FakeCatalogue();
    const fixture = await render(api);

    button(fixture, 'Poser un prix B2B sur Croissant').click();
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

    button(fixture, 'Enregistrer le prix B2B de Croissant').click();
    await fixture.whenStable();

    expect(api.prices).toEqual([{ sku: 'VIE-001-1', priceMillicents: 145_000 }]);
  });

  /**
   * Le serveur refuse un prix égal à celui du PIM ; le dire ici évite un
   * aller-retour pour apprendre une règle que l'écran connaissait déjà.
   */
  it('laisse « Enregistrer » inerte tant que le montant est celui du PIM', async () => {
    const fixture = await render(new FakeCatalogue());

    button(fixture, 'Poser un prix B2B sur Croissant').click();
    fixture.detectChanges();

    expect(button(fixture, 'Enregistrer le prix B2B de Croissant').disabled).toBe(true);
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
      item({ sku: 'VIE-003-1', name: "Patte d'ours", vatRatePercent: null }),
      item({ sku: 'VIE-004-1', name: 'Chausson', isHidden: true }),
    ];
    const fixture = await render(api);

    const shown = text(fixture);
    expect(shown).toContain('Tous (4)');
    expect(shown).toContain('À prix B2B (1)');
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
