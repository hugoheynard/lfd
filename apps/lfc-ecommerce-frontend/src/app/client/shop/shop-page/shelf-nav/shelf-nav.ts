import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CatalogShelfNav, type CatalogShelfNavLabels } from '@lfd/b2b-ui/catalog';

import { ClientCopyService, fill } from '../../../copy/client-copy.service';
import { ShopCatalogue } from '../../shop-catalogue.store';
import { ClientLocale } from '../../../client-locale.service';
import { operationShelfId, operationText } from '../../operations';
import { ALL_SHELVES, FEATURED_SHELF } from '../../shelves';

/**
 * **Le rail des rayons de la boutique** — « Tout », la mise en avant, les
 * opérations datées servies, puis les familles.
 *
 * Le rail lui-même (« Plonger », indicateur, focus) vit dans `@lfd/b2b-ui`
 * depuis le 2026-11-03, partagé avec la saisie de commande du staff. Ce
 * composant ne fait que lui donner la liste de la boutique et ses mots.
 *
 * Il construit sa liste lui-même : elle ne dépend que du catalogue HYDRATÉ et du
 * dictionnaire de langue, jamais de l'écran qui l'affiche. La faire descendre en
 * entrée aurait obligé chaque page à recopier la même concaténation, et deux
 * copies finissent par ne plus s'accorder sur l'ordre.
 *
 * Les rayons arrivent déjà **peuplés et ordonnés** par le serveur : la vitrine
 * ne trie pas et ne filtre pas — un rayon vide n'y est simplement jamais.
 */
@Component({
  selector: 'app-shelf-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogShelfNav],
  templateUrl: './shelf-nav.html',
  styleUrl: './shelf-nav.scss',
})
export class ShelfNav {
  /** Le rayon allumé, ou `null` — une recherche n'en désigne aucun. */
  readonly active = input<string | null>(ALL_SHELVES);

  /** Un rayon choisi. La page en tire ce qu'elle veut : filtrer, et oublier le terme. */
  readonly picked = output<string>();

  protected readonly allId = ALL_SHELVES;
  private readonly t = inject(ClientCopyService).t;
  protected readonly catalogue = inject(ShopCatalogue);
  private readonly locale = inject(ClientLocale);

  /**
   * Une opération servie est un rayon **juste après « Tout »**, dans l'ordre du
   * serveur (D8) : c'est le moment de l'année, pas une famille de plus.
   *
   * La mise en avant passe devant elles (Hugo, 2026-10-19), sous le texte même
   * de la pastille des tuiles (`product.bestSeller`) — et seulement si la vue
   * lue en porte une.
   */
  protected readonly shelves = computed(() => [
    { id: ALL_SHELVES, label: this.t().shop.allShelves },
    ...(this.catalogue.items().some((item) => item.isFeatured)
      ? [{ id: FEATURED_SHELF, label: this.t().product.bestSeller }]
      : []),
    ...this.catalogue.operations().map((operation) => ({
      id: operationShelfId(operation.key),
      label: operationText(operation.name, this.locale.current()),
    })),
    ...this.catalogue
      .shelves()
      .map((shelf) => ({ id: shelf.id, label: shelf.name, parentId: shelf.parentId ?? null })),
  ]);

  protected readonly families = computed(
    () => new Set(this.catalogue.shelves().map((shelf) => shelf.id)),
  );

  protected readonly labels = computed<CatalogShelfNavLabels>(() => {
    const c = this.t().shop;
    return {
      group: c.shelvesGroup,
      all: c.allShelves,
      root: c.shelvesRoot,
      climbToRoot: c.shelfClimbToRoot,
      climbTo: (shelf) => fill(c.shelfClimbTo, { shelf }),
      level: (shelf) => fill(c.shelfLevel, { shelf }),
      withChildren: (shelf, n) => fill(c.shelfWithChildren, { shelf, n: String(n) }),
    };
  });
}
