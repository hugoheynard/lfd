import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { ClientCopyService } from '../../../copy/client-copy.service';
import { ShopCatalogue } from '../../shop-catalogue.store';
import { ClientLocale } from '../../../client-locale.service';
import { operationShelfId, operationText } from '../../operations';
import { ALL_SHELVES } from '../../shelves';

/**
 * **Le rail des rayons** — « Tout », les opérations datées servies, puis les
 * familles.
 *
 * Il construit sa liste lui-même : elle ne dépend que du catalogue HYDRATÉ et du
 * dictionnaire de langue, jamais de l'écran qui l'affiche. La faire descendre en
 * entrée aurait obligé chaque page à recopier la même concaténation, et deux
 * copies finissent par ne plus s'accorder sur l'ordre.
 *
 * Les rayons arrivent déjà **peuplés et ordonnés** par le serveur : la vitrine
 * ne trie pas et ne filtre pas — un rayon vide n'y est simplement jamais.
 *
 * 🔴 **Il ne sait rien de la recherche**, et c'est délibéré. Chercher traverse
 * les rayons, donc aucune pastille n'est active pendant une recherche — mais
 * c'est un fait de la PAGE, qui arbitre entre les deux questions. Elle le dit en
 * passant `active` à `null` ; le rail se contente d'allumer ce qu'on lui
 * désigne. Lui apprendre le terme cherché lui aurait donné une seconde raison de
 * changer.
 *
 * Une seule barre au bureau comme en pile : elle passe d'un rail horizontal qui
 * défile à une colonne, par le CSS seul — deux composants pour deux largeurs
 * auraient dédoublé la liste et son ordre.
 */
@Component({
  selector: 'app-shelf-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shelf-nav.html',
  styleUrl: './shelf-nav.scss',
})
export class ShelfNav {
  /** Le rayon allumé, ou `null` — une recherche n'en désigne aucun. */
  readonly active = input<string | null>(ALL_SHELVES);

  /** Un rayon choisi. La page en tire ce qu'elle veut : filtrer, et oublier le terme. */
  readonly picked = output<string>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly catalogue = inject(ShopCatalogue);
  private readonly locale = inject(ClientLocale);

  /**
   * Une opération servie est un rayon **juste après « Tout »**, dans l'ordre du
   * serveur (D8) : c'est le moment de l'année, pas une famille de plus.
   */
  protected readonly shelves = computed(() => [
    { id: ALL_SHELVES, label: this.t().shop.allShelves },
    ...this.catalogue.operations().map((operation) => ({
      id: operationShelfId(operation.key),
      label: operationText(operation.name, this.locale.current()),
    })),
    ...this.catalogue.shelves().map((shelf) => ({ id: shelf.id, label: shelf.name })),
  ]);
}
