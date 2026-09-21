import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CompanyView } from '@lfd/contracts';

import { ClientCompany } from '../../client-company.service';
import { type CartLine } from '../cart-total';
import { TEST_ITEMS } from '../../shop/shop-catalogue.fixture';
import { CartProductLine } from './cart-product-line';

describe('CartProductLine', () => {
  let fixture: ComponentFixture<CartProductLine>;

  const field = (): HTMLInputElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'fold-number-input input',
    );

  const text = (selector: string): string =>
    (fixture.nativeElement as HTMLElement).querySelector(selector)?.textContent?.trim() ?? '';

  /**
   * @param htCents le total hors taxe rendu par le serveur, `null` = pas encore su.
   * @param ttcCents le même total taxe comprise — les deux entrent, la ligne choisit.
   */
  function render(
    quantity: number,
    htCents: number | null = null,
    ttcCents: number | null = null,
  ): void {
    // 1,40 € HT / 1,48 € TTC à 5,5 % — le premier article de la vitrine de test.
    const line: CartLine = { product: TEST_ITEMS[0]!, quantity };
    fixture = TestBed.createComponent(CartProductLine);
    fixture.componentRef.setInput('line', line);
    if (htCents !== null) {
      fixture.componentRef.setInput('totalHtCents', htCents);
    }
    if (ttcCents !== null) {
      fixture.componentRef.setInput('totalTtcCents', ttcCents);
    }
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CartProductLine] });
  });

  /**
   * 🔴 **La ligne d'un PARTICULIER parle TTC, comme le rayon** (R2, 2026-09-21).
   *
   * Ce cas attendait « 1,40 € HT ». C'était cohérent avec le décompte et faux
   * pour le client : il venait de lire « 1,48 € TTC » sur la vignette, et le
   * panier lui répondait un autre nombre pour le même croissant. L'écart était
   * en sa faveur, donc personne ne réclamait — et personne ne finissait
   * d'acheter non plus.
   *
   * Le montant est celui du rayon, `unitPriceTtcCents`, au centime près : c'est
   * le même champ, pas un recalcul qui lui ressemble.
   */
  it('porte la quantité, le nom et le prix unitaire TTC à un particulier', () => {
    render(1);

    expect(field()?.value).toBe('1');
    expect(text('.name')).toBe('Croissant au beurre');
    expect(text('.unit')).toBe('1,48 € TTC');
  });

  /**
   * 🔴 **Un PROFESSIONNEL garde le hors taxe**, ligne comprise — la même règle
   * qu'au rayon, tirée du même fait : sans société, on achète en particulier.
   *
   * Sans ce cas, basculer tout le panier en TTC passerait au vert.
   */
  it('🔴 garde le HORS TAXE pour un professionnel, unité et total', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CartProductLine],
      providers: [
        {
          provide: ClientCompany,
          useValue: { company: signal<Partial<CompanyView>>({ status: 'active' }) },
        },
      ],
    });
    render(3, 420, 443);

    expect(text('.unit')).toBe('1,40 € HT');
    expect(text('.sum')).toBe('4,20 €');
  });

  /**
   * 🔴 **La ligne ne multiplie plus rien** : le total lui est DONNÉ, tel que le
   * serveur l'a arrondi. Elle le calculait, ce qui donnait une seconde règle
   * d'arrondi et une multiplication qui deviendrait fausse en silence le jour
   * où un palier de volume existe (`D2`, fix 2026-09-06).
   */
  it('affiche le total de ligne que le serveur a rendu', () => {
    render(3, 420, 443);

    expect(text('.unit')).toBe('1,48 € TTC');
    // 4,43 € et non 4,20 € × 1,055 arrondi à la main : la ventilation du
    // serveur est la seule règle d'arrondi, et elle a déjà tranché.
    expect(text('.sum')).toBe('4,43 €');
  });

  /**
   * Tant que le décompte n'est pas revenu, un tiret — jamais un nombre inventé.
   * C'est la contrepartie de ne plus calculer : on ne sait pas encore.
   */
  it('avoue ne pas savoir tant que le décompte n’est pas arrivé', () => {
    render(3);

    expect(text('.sum')).toBe('—');
  });

  /**
   * 🔴 Le champ EMPILÉ de fold, pas le rail du rayon : au panier on corrige une
   * quantité, on n'en ajoute pas une. Douze croissants ne se retirent pas en
   * douze appuis, et le champ se tape.
   */
  it('règle sa quantité par un champ, pas par un rail', () => {
    render(2);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('fold-number-input')).not.toBeNull();
    expect(el.querySelector('app-quantity-rail')).toBeNull();
  });

  /** C'est la LIGNE qu'on nomme : le produit se lit avant la quantité. */
  it('porte le nom du produit comme nom accessible', () => {
    render(1);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.getAttribute('role')).toBe('group');
    expect(el.getAttribute('aria-label')).toBe('Croissant au beurre');
  });

  /**
   * 🔴 La corbeille retire la LIGNE, pas une pièce — et c'est le seul chemin
   * vers zéro, puisque le champ s'arrête à un.
   */
  it('distingue la corbeille du réglage de quantité', () => {
    render(12);
    let dropped = 0;
    let quantities = 0;
    fixture.componentInstance.dropped.subscribe(() => (dropped += 1));
    fixture.componentInstance.quantityChange.subscribe(() => (quantities += 1));

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.drop')?.click();

    expect(dropped).toBe(1);
    expect(quantities).toBe(0);
  });
});
