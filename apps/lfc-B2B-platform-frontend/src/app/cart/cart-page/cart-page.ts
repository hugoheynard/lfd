import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
} from 'fold-ng';
import { CartRow } from '@lfd/b2b-ui/cart';

import type { FoldProduct, FoldProductOrder } from '../../../shared';
import { FeaturedRail, type FeaturedItem } from '../../boutique/featured-rail/featured-rail';
import { CommerceNav } from '../../commerce/commerce-nav/commerce-nav';
import { CommerceContextService } from '../../commerce/commerce-context.service';
import { formatEurValue, PRODUCTS, productById } from '../../data/catalogue-seed';
import { CartService, type CartLine } from '../../data/cart.service';
import { SavedBasketsService } from '../../data/saved-baskets.service';
import { CheckoutPanel } from '../../orders/checkout-panel/checkout-panel';
import { OrderPreflightService } from '../../orders/preflight.service';

/** Combien de suggestions au maximum dans le carrousel. */
const MAX_SUGGESTIONS = 8;

/**
 * Le temps qu'on laisse au client avant de contrôler son panier.
 *
 * Un stepper qu'on tient enfoncé émet une valeur par pression : sans ce délai,
 * passer de 2 à 12 déclencherait dix contrôles, et l'avant-dernier pourrait
 * répondre après le dernier — donc afficher un avertissement sur une quantité
 * qui n'est plus à l'écran.
 */
const PREFLIGHT_DEBOUNCE_MS = 500;

/**
 * Page **Panier** — le panier actif en pleine page (et non plus seulement le
 * panneau). On y ajuste les quantités, on **verrouille** le panier (il part en
 * attente, éventuellement récurrent), ou on commande. En bas, un carrousel de
 * **suggestions** reprend des produits de vos paniers en attente récents.
 */
@Component({
  selector: 'app-cart-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    CartRow,
    CommerceNav,
    FeaturedRail,
  ],
  templateUrl: './cart-page.html',
  styleUrl: './cart-page.scss',
})
export class CartPage {
  protected readonly cart = inject(CartService);
  private readonly saved = inject(SavedBasketsService);
  private readonly context = inject(CommerceContextService);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly preflight = inject(OrderPreflightService);
  private readonly router = inject(Router);

  protected readonly lines = this.cart.lines;
  protected readonly selected = this.context.selected;

  /**
   * Ce que la plateforme a à dire sur ce panier, **par SKU** — l'avertissement
   * se colle sous la ligne concernée, donc il se range par elle.
   */
  protected readonly warnings = signal<ReadonlyMap<string, string>>(new Map());

  constructor() {
    // Le panier change (quantité, ligne retirée, établissement) → on recontrôle.
    // Le nettoyage annule le contrôle en attente : c'est ce qui garantit qu'une
    // réponse tardive ne peut pas parler d'un panier qui n'existe plus.
    effect((onCleanup) => {
      const company = this.selected();
      const lines = this.cart.lines().map((line) => ({ sku: line.product.id, quantity: line.qty }));
      if (company === null || lines.length === 0) {
        this.warnings.set(new Map());
        return;
      }
      const timer = setTimeout(
        () => void this.checkBasket(company.id, lines),
        PREFLIGHT_DEBOUNCE_MS,
      );
      onCleanup(() => clearTimeout(timer));
    });
  }

  /**
   * Un contrôle qui échoue ne dit **rien**. Un garde-fou est un service rendu,
   * pas une obligation : afficher « le contrôle a échoué » sous une ligne de
   * panier inquiéterait sur un panier parfaitement valide, et n'appellerait
   * aucune action de la part du client.
   */
  private async checkBasket(
    companyId: string,
    lines: readonly { sku: string; quantity: number }[],
  ): Promise<void> {
    try {
      const view = await this.preflight.check({ companyId, lines: [...lines] });
      this.warnings.set(new Map(view.warnings.map((warning) => [warning.sku, warning.message])));
    } catch {
      this.warnings.set(new Map());
    }
  }

  /** On ne peut verrouiller/commander qu'avec un établissement et un panier non vide. */
  protected readonly canLock = computed(() => !this.cart.isEmpty() && this.selected() !== null);

  /**
   * Suggestions : les produits déjà présents dans les paniers en attente de
   * l'établissement (hors panier courant), complétés par des produits populaires
   * du catalogue. « Vous avez ajouté ces produits récemment — les rajouter ? »
   */
  protected readonly suggestions = computed<readonly FeaturedItem[]>(() => {
    const inCart = new Set(this.cart.lines().map((line) => line.product.id));
    const company = this.selected();
    const items: FeaturedItem[] = [];
    const seen = new Set<string>();

    const push = (product: FoldProduct | undefined, flag: string): void => {
      if (product === undefined || inCart.has(product.id) || seen.has(product.id)) {
        return;
      }
      seen.add(product.id);
      items.push({ product, flag, highlight: false });
    };

    if (company !== null) {
      for (const basket of this.saved.forCompany(company.id)) {
        for (const line of basket.lines) {
          push(productById(line.sku), 'Déjà commandé');
        }
      }
    }
    for (const product of PRODUCTS) {
      if (items.length >= MAX_SUGGESTIONS) {
        break;
      }
      push(product, 'Populaire');
    }
    return items.slice(0, MAX_SUGGESTIONS);
  });

  protected fmt(value: number): string {
    return formatEurValue(value);
  }

  /** Le prix de la ligne partagée est en **centimes** ; le panier compte en euros. */
  protected cents(eur: number): number {
    return Math.round(eur * 100);
  }

  protected onQty(line: CartLine, value: number): void {
    this.cart.setQty(line.product.id, value);
  }

  protected remove(line: CartLine): void {
    this.cart.remove(line.product.id);
  }

  protected clear(): void {
    this.cart.clear();
  }

  protected addSuggestion(order: FoldProductOrder): void {
    this.cart.add(order.product.id, order.quantity);
  }

  /** Enregistre le panier courant comme panier réutilisable, puis ouvre la liste. */
  protected save(): void {
    const company = this.selected();
    if (company === null || this.cart.isEmpty()) {
      return;
    }
    const name = `Panier du ${new Date().toLocaleDateString('fr-FR')}`;
    const lines = this.cart.lines().map((line) => ({ sku: line.product.id, qty: line.qty }));
    const id = this.saved.create(company.id, name, lines);
    this.cart.clear();
    void this.router.navigate(['/mes-paniers', id]);
  }

  /** Ouvre le checkout (acheminement déjà choisi au panier, commande sans entreprise).
   * Côté hérité de `CheckoutPanel.foldPanel` (`auto` → bottom-sheet sur mobile). */
  protected checkout(): void {
    this.panelHost.open(CheckoutPanel);
  }
}
