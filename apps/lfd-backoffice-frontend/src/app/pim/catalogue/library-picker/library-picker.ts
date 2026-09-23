import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { LibraryMediaView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { MediaLibraryHttpApi } from '../../../../../../mediatheque/media-library-http-api';

/**
 * Charge d'ouverture : ce que la fiche porte DÉJÀ.
 *
 * 🔴 Le panneau s'en sert pour montrer ces images comme déjà prises plutôt que
 * de les laisser choisir et les ignorer ensuite. Un écran qui accepte un geste
 * sans effet apprend à se méfier de lui.
 */
export interface LibraryPickerData {
  readonly already: readonly string[];
}

/** Une image retenue : ce dont la fiche a besoin pour la porter. */
export interface PickedMedia {
  readonly url: string;
  readonly name: string;
}

/** Assez pour un fonds de démarrage ; la recherche prend le relais ensuite. */
const PAGE_SIZE = 100;

/**
 * Panneau **Choisir dans la médiathèque**.
 *
 * 🔴 C'est le renversement du modèle : jusqu'ici, une image entrait dans le
 * catalogue **par** une fiche, et la retrouver demandait de se souvenir de
 * quelle fiche la portait. On dépose et on tague à la source ; on attribue à
 * l'usage.
 *
 * Aucun dépôt ici — ces octets sont déjà chez nous. Le panneau ne fait que
 * désigner, et c'est ce qui le rend sans risque : renoncer ne laisse rien
 * derrière.
 */
@Component({
  selector: 'app-library-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent],
  templateUrl: './library-picker.html',
  styleUrl: './library-picker.scss',
})
export class LibraryPicker {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

  private readonly ref = inject<FoldPanelRef<readonly PickedMedia[]>>(FoldPanelRef);
  private readonly api = inject(MediaLibraryHttpApi);

  readonly data = input.required<LibraryPickerData>();

  protected readonly images = signal<readonly LibraryMediaView[]>([]);
  protected readonly loading = signal(true);
  protected readonly failure = signal<string | null>(null);
  protected readonly search = signal('');

  /** Les URL retenues. Un `Set` serait plus juste, mais les signaux comparent
   *  par référence et un tableau relu suffit à cette échelle. */
  protected readonly picked = signal<readonly string[]>([]);

  /**
   * Ce que le panneau montre.
   *
   * La recherche vise l'étiquette **et les mots-clés** — pas le nom de
   * fichier : personne ne se souvient de `a3f9…png`, et c'est précisément pour
   * ça que les tags existent.
   */
  protected readonly shown = computed(() => {
    const needle = this.search().trim().toLowerCase();
    if (needle === '') {
      return this.images();
    }
    return this.images().filter(
      (image) =>
        image.name.toLowerCase().includes(needle) || image.tags.some((tag) => tag.includes(needle)),
    );
  });

  constructor() {
    void this.load();
  }

  protected label(image: LibraryMediaView): string {
    return image.name === '' ? (image.url.split('/').at(-1) ?? image.url) : image.name;
  }

  protected isPicked(url: string): boolean {
    return this.picked().includes(url);
  }

  /** Cette image est-elle déjà portée par la fiche ? */
  protected isAlready(url: string): boolean {
    return this.data().already.includes(url);
  }

  protected toggle(url: string): void {
    if (this.isAlready(url)) {
      return;
    }
    this.picked.update((current) =>
      current.includes(url) ? current.filter((kept) => kept !== url) : [...current, url],
    );
  }

  /**
   * Rend les images retenues **dans l'ordre où on les a désignées**.
   *
   * Pas dans l'ordre de la bibliothèque : celui qui choisit trois visuels pour
   * une fiche les choisit dans l'ordre où il veut les voir, et le lui réordonner
   * en douce l'obligerait à tout replacer ensuite.
   */
  protected confirm(): void {
    const byUrl = new Map(this.images().map((image) => [image.url, image]));
    this.ref.close(
      this.picked().flatMap((url) => {
        const image = byUrl.get(url);
        return image === undefined ? [] : [{ url, name: image.name }];
      }),
    );
  }

  /** Renoncer ne rend RIEN — distinct d'une sélection vide, qui n'existe pas
   *  puisque le bouton reste fermé tant que rien n'est retenu. */
  protected dismiss(): void {
    this.ref.close();
  }

  private async load(): Promise<void> {
    try {
      const page = await this.api.page(PAGE_SIZE, 0);
      this.images.set(page.items);
    } catch {
      this.failure.set("La médiathèque n'a pas pu être lue.");
    } finally {
      this.loading.set(false);
    }
  }
}
