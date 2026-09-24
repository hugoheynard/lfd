import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import type { StorefrontContent } from '@lfd/contracts';
import { contentsOf } from '@lfd/storefront-layout';
import { FoldBadgeComponent, FoldButtonComponent, FoldButtonIconComponent } from 'fold-ng';

import { type EditorBlock, itemsOf, moveItem, removeItem, replaceItem } from '../storefront-block';
import type { ShelfOption, StorefrontCatalog } from '../storefront-catalog';
import { StorefrontInfoForm } from '../storefront-info-form/storefront-info-form';
import { StorefrontProductPicker } from '../storefront-product-picker/storefront-product-picker';
import { emptyInfo, type InfoContent, infoIssues } from '../storefront-text';

/** Ce qu'on ouvre sous la liste : la rédaction d'un contenu, ou le choix d'un article à ajouter. */
type Opened = { readonly index: number } | 'adding-product' | null;

/**
 * Les contenus d'un objet, dans l'ordre où ils défilent (D4) : un seul, ou
 * plusieurs — ajouter, retirer, réordonner, rédiger.
 *
 * Il ne tient que ce qui est OUVERT ; la liste est celle de l'objet, et chaque
 * geste la rend entière à l'éditeur. Un contenu **produit** ne porte que son
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

  protected readonly opened = linkedSignal<string, Opened>({
    source: () => this.block().id,
    computation: () => null,
  });

  protected readonly items = computed(() => itemsOf(this.block()));

  /** « Un seul » n'en porte qu'un : le serveur refuserait le second. */
  protected readonly canAdd = computed(
    () => contentsOf(this.block()) === 'multiple' || this.items().length === 0,
  );

  private readonly names = computed(
    () => new Map((this.catalog()?.products ?? []).map((product) => [product.sku, product.name])),
  );

  protected isOpen(index: number): boolean {
    const opened = this.opened();
    return typeof opened === 'object' && opened !== null && opened.index === index;
  }

  protected toggle(index: number): void {
    this.opened.set(this.isOpen(index) ? null : { index });
  }

  /** Le nom de l'article, ou son SKU quand le catalogue ne le connaît pas ; le titre d'une info. */
  protected nameOf(item: StorefrontContent): string {
    if (item.kind === 'product') {
      return this.names().get(item.sku) ?? item.sku;
    }
    return item.title.fr.trim() === '' ? 'Sans titre' : item.title.fr;
  }

  /** Un SKU que le catalogue ne sert plus : la boutique ne le rendra pas (D4). */
  protected isUnserved(item: StorefrontContent): boolean {
    return item.kind === 'product' && this.catalog() !== null && !this.names().has(item.sku);
  }

  protected issuesOf(item: StorefrontContent): readonly string[] {
    return item.kind === 'info' ? infoIssues(item) : [];
  }

  protected move(index: number, delta: -1 | 1): void {
    this.itemsChange.emit(moveItem(this.items(), index, delta));
    this.opened.set(null);
  }

  protected remove(index: number): void {
    this.itemsChange.emit(removeItem(this.items(), index));
    this.opened.set(null);
  }

  protected replaceProduct(index: number, sku: string): void {
    this.itemsChange.emit(replaceItem(this.items(), index, { kind: 'product', sku }));
  }

  protected replaceInfo(index: number, info: InfoContent): void {
    this.itemsChange.emit(replaceItem(this.items(), index, info));
  }

  protected addProduct(sku: string): void {
    this.itemsChange.emit([...this.items(), { kind: 'product', sku }]);
    this.opened.set(null);
  }

  /** Une info neuve s'ouvre aussitôt : elle n'a pas encore de titre. */
  protected addInfo(): void {
    this.itemsChange.emit([...this.items(), emptyInfo()]);
    this.opened.set({ index: this.items().length });
  }

  protected startAddingProduct(): void {
    this.opened.set('adding-product');
  }
}
