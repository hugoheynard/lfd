import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { LibraryMediaView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { BatchUploadStore } from '../batch-upload';
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
  // Fourni par la PAGE et non à la racine : un compte rendu de dépôt appartient
  // à l'écran qui l'a lancé, et le quitter doit l'oublier.
  providers: [BatchUploadStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediathequePage {
  private readonly api = inject(MediaLibraryHttpApi);
  protected readonly batch = inject(BatchUploadStore);

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

  /**
   * Dépose la sélection, puis relit la bibliothèque **une seule fois**.
   *
   * Relire après chaque fichier ferait N requêtes et un écran qui saute à
   * chaque image. Le compte rendu du lot dit déjà où en est chacun ; la grille
   * n'a besoin d'être juste qu'à la fin.
   *
   * 🔴 On relit depuis le DÉBUT : une image déposée peut apparaître n'importe
   * où dans l'ordre — la bibliothèque trie par premier dépôt, et redéposer des
   * octets déjà connus ne crée pas d'entrée neuve. Ajouter une page à la suite
   * laisserait la grille mentir.
   */
  protected async deposit(picked: EventTarget | null): Promise<void> {
    const input = picked instanceof HTMLInputElement ? picked : null;
    const files = input === null ? [] : [...(input.files ?? [])];
    if (input !== null) {
      // Remis à zéro TOUT DE SUITE : sans ça, redéposer la même sélection ne
      // déclenche aucun `change`, et l'écran a l'air cassé.
      input.value = '';
    }
    if (files.length === 0) {
      return;
    }
    if ((await this.batch.send(files)) > 0) {
      await this.reload();
    }
  }

  /** Rejoue les refusés, et relit si quelque chose est passé. */
  protected async retry(): Promise<void> {
    if ((await this.batch.retry()) > 0) {
      await this.reload();
    }
  }

  private async reload(): Promise<void> {
    this.items.set([]);
    this.offset.set(0);
    await this.load();
  }
}
