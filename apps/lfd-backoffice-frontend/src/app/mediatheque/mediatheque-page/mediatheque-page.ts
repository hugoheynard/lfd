import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { LibraryMediaView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { MediaLibraryHttpApi } from '../media-library-http-api';

/** Une page d'aperçus. Le serveur reborne de toute façon à 100. */
const PAGE_SIZE = 60;

/**
 * **La médiathèque** — le fonds d'images, indépendamment de ce qui l'affiche.
 *
 * Écran de premier niveau, et pas une vue du référentiel : les fiches portent
 * des visuels, les familles aussi, et les contenus de la vitrine en porteront.
 * Aucun d'eux ne possède la bibliothèque.
 *
 * 🔴 Ce que cet écran ne fait PAS, et qu'il ne faut pas lui ajouter par
 * commodité : dédoublonner. Le serveur groupe par URL — la seule identité qui
 * traverse deux enregistrements de fiche — et une seconde règle de groupement
 * ici finirait par ne plus dire la même chose que la première.
 */
@Component({
  selector: 'app-mediatheque-page',
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './mediatheque-page.html',
  styleUrl: './mediatheque-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediathequePage {
  private readonly api = inject(MediaLibraryHttpApi);

  protected readonly items = signal<readonly LibraryMediaView[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  /**
   * Le message d'un échec, `null` sinon.
   *
   * Une grille vide et une grille qui n'a pas pu charger se ressemblent à
   * l'écran ; les confondre ferait croire le fonds vide au premier réseau qui
   * tousse.
   */
  protected readonly failure = signal<string | null>(null);

  private readonly offset = signal(0);

  protected readonly hasMore = computed(() => this.items().length < this.total());

  constructor() {
    void this.load();
  }

  /** Charge la page suivante et l'ajoute à ce qui est déjà affiché. */
  protected async load(): Promise<void> {
    this.loading.set(true);
    this.failure.set(null);
    try {
      const page = await this.api.page(PAGE_SIZE, this.offset());
      this.items.update((current) => [...current, ...page.items]);
      this.total.set(page.total);
      this.offset.update((current) => current + page.items.length);
    } catch {
      this.failure.set("La bibliothèque n'a pas pu être lue.");
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Ce que l'image porte, dit en toutes lettres.
   *
   * 🔴 Le compte d'emplois est affiché AVANT toute proposition de suppression,
   * et c'est le seul point de cet écran qui n'est pas décoratif : on ne
   * supprime pas une image qu'un porteur affiche, et la base le refuse. Sans
   * cette phrase, la règle s'apprendrait par un échec.
   */
  protected usesLabel(item: LibraryMediaView): string {
    if (item.uses === 0) {
      return 'aucun emploi';
    }
    return item.uses === 1 ? '1 emploi' : `${String(item.uses)} emplois`;
  }

  /** L'étiquette, ou l'aveu qu'elle manque — jamais un vide qu'on lit mal. */
  protected label(item: LibraryMediaView): string {
    return item.name === '' ? 'Sans étiquette' : item.name;
  }

  /** Le nom de fichier, pour reconnaître une image qu'on n'a pas nommée. */
  protected fileOf(item: LibraryMediaView): string {
    return item.url.split('/').at(-1) ?? item.url;
  }
}
