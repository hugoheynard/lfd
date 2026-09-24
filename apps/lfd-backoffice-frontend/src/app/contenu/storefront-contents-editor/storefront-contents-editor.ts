import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  model,
  output,
} from '@angular/core';
import type { StorefrontContent } from '@lfd/contracts';
import { activeCarousel, contentsOf } from '@lfd/storefront-layout';
import { FoldBadgeComponent, FoldButtonComponent, FoldButtonIconComponent } from 'fold-ng';

import { type EditorBlock, itemsOf, moveItem, removeItem, replaceItem } from '../storefront-block';
import type { ShelfOption, StorefrontCatalog } from '../storefront-catalog';
import { StorefrontInfoForm } from '../storefront-info-form/storefront-info-form';
import { StorefrontProductPicker } from '../storefront-product-picker/storefront-product-picker';
import { emptyInfo, type InfoContent, infoIssues } from '../storefront-text';

/** Un article en cours de choix, avant qu'il n'entre dans la liste. */
type Adding = 'product' | null;

/**
 * Les contenus d'un objet, dans l'ordre où ils défilent (D4) : un seul, ou
 * plusieurs — ajouter, retirer, réordonner, rédiger.
 *
 * En « Plusieurs », un onglet numéroté par contenu, avec sa durée à l'écran,
 * et UN SEUL contenu ouvert dessous : celui qu'on prépare (Hugo, 2026-09-24 :
 * la liste repliée ne disait ni lequel on éditait, ni quand il passait). Le
 * contenu sélectionné est un `model` : le dialogue le lit pour caler
 * l'aperçu dessus.
 *
 * La liste est celle de l'objet, et chaque geste la rend entière à l'éditeur. Un contenu **produit** ne porte que son
 * SKU, dont il montre le nom — et dit s'il n'est plus en vente.
 */
@Component({
  selector: 'app-storefront-contents-editor',
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    StorefrontInfoForm,
    StorefrontProductPicker,
  ],
  templateUrl: './storefront-contents-editor.html',
  styleUrl: './storefront-contents-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorefrontContentsEditor {
  readonly block = input.required<EditorBlock>();
  /** `null` : le catalogue n'a pas pu être lu — on ne choisit ni ne vérifie d'article. */
  readonly catalog = input.required<StorefrontCatalog | null>();
  readonly shelves = input.required<readonly ShelfOption[]>();
  readonly itemsChange = output<readonly StorefrontContent[]>();

  /** L'index du contenu préparé ; le dialogue le tient, pour que l'aperçu le suive. */
  readonly selected = model(0);

  /** Remis à zéro quand on passe à un AUTRE objet (un `computed` : cf. la régression ci-dessous). */
  private readonly blockId = computed(() => this.block().id);

  /**
   * 🔴 Régression du 2026-09-24 : la source était `() => this.block().id`,
   * réévaluée à chaque frappe dans le formulaire d'info — qui se fermait dès
   * la première lettre.
   */
  protected readonly adding = linkedSignal<string, Adding>({
    source: this.blockId,
    computation: () => null,
  });

  protected readonly items = computed(() => itemsOf(this.block()));
  protected readonly multiple = computed(() => contentsOf(this.block()) === 'multiple');

  /** « Un seul » n'en porte qu'un : le serveur refuserait le second. */
  protected readonly canAdd = computed(() => this.multiple() || this.items().length === 0);

  /** Borné à la liste : un contenu retiré ailleurs ne laisse pas l'onglet sur rien. */
  protected readonly current = computed(() =>
    Math.min(Math.max(this.selected(), 0), Math.max(this.items().length - 1, 0)),
  );

  protected readonly currentItem = computed(() => this.items()[this.current()] ?? null);

  private readonly carousel = computed(() => activeCarousel(this.block()));

  private readonly names = computed(
    () => new Map((this.catalog()?.products ?? []).map((product) => [product.sku, product.name])),
  );

  protected select(index: number): void {
    this.adding.set(null);
    this.selected.set(index);
  }

  /** Le temps d'écran d'un contenu en défilement automatique ; `null` sinon. */
  protected secondsOf(index: number): number | null {
    const carousel = this.carousel();
    if (carousel === null || !carousel.autoplay) {
      return null;
    }
    return index === 0 ? carousel.firstSeconds : carousel.intervalSeconds;
  }

  /** Le nom de l'article, ou son SKU quand le catalogue ne le connaît pas ; le titre d'une info. */
  protected nameOf(item: StorefrontContent): string {
    if (item.kind === 'product') {
      return this.names().get(item.sku) ?? item.sku;
    }
    return item.title.fr.trim() === '' ? 'Sans titre' : item.title.fr;
  }

  /** Un onglet à reprendre : article plus en vente, ou info incomplète. */
  protected isFlagged(item: StorefrontContent): boolean {
    return this.isUnserved(item) || this.issuesOf(item).length > 0;
  }

  /** Un SKU que le catalogue ne sert plus : la boutique ne le rendra pas (D4). */
  protected isUnserved(item: StorefrontContent): boolean {
    return item.kind === 'product' && this.catalog() !== null && !this.names().has(item.sku);
  }

  protected issuesOf(item: StorefrontContent): readonly string[] {
    return item.kind === 'info' ? infoIssues(item) : [];
  }

  protected move(delta: -1 | 1): void {
    const index = this.current();
    this.itemsChange.emit(moveItem(this.items(), index, delta));
    this.selected.set(index + delta);
  }

  protected remove(): void {
    const index = this.current();
    this.itemsChange.emit(removeItem(this.items(), index));
    this.selected.set(Math.max(index - 1, 0));
  }

  protected replaceProduct(sku: string): void {
    this.itemsChange.emit(replaceItem(this.items(), this.current(), { kind: 'product', sku }));
  }

  protected replaceInfo(info: InfoContent): void {
    this.itemsChange.emit(replaceItem(this.items(), this.current(), info));
  }

  /** Le nouveau contenu devient celui qu'on prépare. L'index est pris AVANT l'émission. */
  protected addProduct(sku: string): void {
    const index = this.items().length;
    this.itemsChange.emit([...this.items(), { kind: 'product', sku }]);
    this.adding.set(null);
    this.selected.set(index);
  }

  protected addInfo(): void {
    const index = this.items().length;
    this.itemsChange.emit([...this.items(), emptyInfo()]);
    this.adding.set(null);
    this.selected.set(index);
  }

  protected startAddingProduct(): void {
    this.adding.set('product');
  }
}
