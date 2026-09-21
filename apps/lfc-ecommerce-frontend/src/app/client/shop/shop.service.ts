import { computed, inject, Injectable } from '@angular/core';

import { ClientCopyService, fill } from '../copy/client-copy.service';
import { ShopCatalogue } from './shop-catalogue.store';
import { ShopStore } from './shop.store';
import { ALL_SHELVES } from './shelves';

/**
 * Retire accents et casse : « éclair » et « eclair » cherchent la même chose.
 *
 * Sans ça, le seul client qui trouve l'éclair est celui qui sait où est
 * l'accent aigu sur son clavier — et il n'y a aucune raison de le lui demander.
 */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * **Ce que la boutique montre**, et pourquoi.
 *
 * Les règles vivent ici ; l'état est dans {@link ShopStore}, que ce service est
 * seul à faire bouger. Trois d'entre elles, et aucune n'est évidente :
 *
 * 1. **La recherche TRAVERSE les rayons.** « pain » sort le pain de campagne, la
 *    baguette ET le pain au chocolat, parce que le client ne sait pas dans quel
 *    rayon on a rangé quoi. Un rayon filtré pendant une recherche cacherait donc
 *    la moitié des réponses ;
 * 2. **une seule des deux questions peut gagner.** Chercher ignore le rayon, et
 *    choisir un rayon OUBLIE le terme — pas seulement le filtre. Laisser le
 *    terme dans le champ au-dessus d'une grille qui ne l'honore plus est le
 *    genre d'écran dont on ne sait pas dire ce qu'il montre ;
 * 3. **le titre dit laquelle a gagné.** « Résultats pour “pain” » ou le nom du
 *    rayon : c'est la seule chose à l'écran qui explique la grille.
 */
@Injectable()
export class Shop {
  private readonly store = inject(ShopStore);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly t = inject(ClientCopyService).t;

  /** Le terme cherché — écrit directement par le champ, qui en est la vue. */
  readonly query = this.store.query;

  /**
   * Le terme **rogné** — la seule définition de « chercher quelque chose ».
   *
   * Elle est unique parce qu'elle était triple, et qu'une des trois divergeait :
   * le filtrage et le titre rognaient, l'allumage du rail non. Trois espaces
   * éteignaient donc toutes les pastilles au-dessus d'une grille qui montrait
   * toujours son rayon. Personne ne l'aurait vu tant que les trois vivaient dans
   * des expressions séparées d'un gabarit.
   */
  private readonly term = computed(() => this.store.query().trim());

  /** Les pièces à montrer : celles du terme s'il y en a un, celles du rayon sinon. */
  readonly products = computed(() => {
    const items = this.catalogue.items();
    const query = fold(this.term());
    if (query !== '') {
      // La note peut être absente — le référentiel n'impose aucun éditorial — et
      // chercher dedans ne doit pas devenir chercher dans « null ».
      return items.filter(
        (item) => fold(item.name).includes(query) || fold(item.note ?? '').includes(query),
      );
    }
    const shelf = this.store.shelf();
    return shelf === ALL_SHELVES ? items : items.filter((item) => item.shelfId === shelf);
  });

  /** Le titre de la grille : le rayon, ou ce qu'on vient de chercher. */
  readonly heading = computed(() => {
    const c = this.t().shop;
    const query = this.term();
    if (query !== '') {
      return fill(c.resultsFor, { query });
    }
    return this.shelfTitle(this.store.shelf(), c.allShelvesTitle);
  });

  /**
   * Le rayon à ALLUMER dans le rail, ou `null`.
   *
   * `null` pendant une recherche : elle traverse les rayons, donc aucune
   * pastille n'est juste. C'est ici que ça se décide et pas dans le rail — lui
   * n'a pas à connaître le terme cherché.
   */
  readonly activeShelf = computed(() => (this.term() === '' ? this.store.shelf() : null));

  /** Le rayon dont la bannière et la feuille racontent l'histoire. */
  readonly shelf = this.store.shelf.asReadonly();

  /** Choisir un rayon oublie le terme : les deux répondent à la même question. */
  browse(shelfId: string): void {
    this.store.shelf.set(shelfId);
    this.store.query.set('');
  }

  private shelfTitle(shelf: string, fallback: string): string {
    return shelf === ALL_SHELVES
      ? fallback
      : (this.catalogue.shelves().find((entry) => entry.id === shelf)?.name ?? fallback);
  }
}
