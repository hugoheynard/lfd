import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import type { LibraryMediaView, MediaFactsView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { MediaLibraryHttpApi } from '../../../mediatheque/media-library-http-api';

/**
 * Charge d'ouverture : ce que le porteur porte DÉJÀ.
 *
 * 🔴 Le panneau s'en sert pour montrer ces images comme déjà prises plutôt que
 * de les laisser choisir et les ignorer ensuite. Un écran qui accepte un geste
 * sans effet apprend à se méfier de lui.
 */
export interface LibraryPickerData {
  readonly already: readonly string[];
}

/**
 * Une image retenue : ce dont le porteur a besoin pour la porter.
 *
 * 🔴 Les faits MESURÉS voyagent avec, et ils ne sont pas décoratifs : la
 * galerie affiche la forme réelle du fichier, et sans eux une image rattachée
 * s'afficherait « Dimensions inconnues » jusqu'au prochain rechargement de la
 * page. Ils viennent de la bibliothèque, qui les a constatés dans les octets —
 * jamais d'un navigateur, qui pourrait en dire autre chose.
 */
export interface PickedMedia extends MediaFactsView {
  readonly url: string;
  readonly name: string;
}

/**
 * Assez pour un fonds de démarrage ; la recherche prend le relais ensuite.
 *
 * 🔴 « Prend le relais » est vrai depuis le 2026-09-23 SEULEMENT. La recherche
 * filtrait ce qui était chargé : l'image cent-unième était donc introuvable
 * quoi qu'on tape, et rien à l'écran ne le disait. Elle part au serveur.
 */
const PAGE_SIZE = 100;

/**
 * Panneau **Choisir dans la médiathèque**.
 *
 * 🔴 C'est le renversement du modèle : jusqu'ici, une image entrait dans le
 * catalogue **par** une fiche, et la retrouver demandait de se souvenir de
 * quelle fiche la portait. On dépose et on tague à la source ; on attribue à
 * l'usage.
 *
 * 🔴 **Aucun dépôt ici, et c'est un choix de MÉTIER** (2026-09-23). Le panneau
 * a porté une zone de dépôt le temps d'un essai, pour épargner un aller-retour
 * à qui rédige une fiche. C'était compter en gestes : alimenter et taguer le
 * fonds est le travail de quelqu'un d'autre que rédiger une fiche, et un dépôt
 * offert ici aurait rempli la bibliothèque d'images **non taguées** — déposées
 * par qui n'a pas le vocabulaire en tête, et que personne ne retrouverait.
 * C'est exactement le trou que la médiathèque a été faite pour boucher.
 *
 * Le panneau ne fait donc que désigner, et c'est ce qui le rend sans risque :
 * renoncer ne laisse rien derrière.
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
   * Relit le fonds avec la recherche courante.
   *
   * 🔴 Une RELECTURE, et non un filtre : `shown` était un `computed` sur
   * `images()`, donc il ne cherchait que dans les cent premières. Ce qui
   * ressemblait à une recherche était un tri d'échantillon.
   *
   * ⚠️ La recherche vise l'ÉTIQUETTE, jamais le nom de fichier : personne ne
   * se souvient de `a3f9….png`, et c'est précisément pour ça que les
   * étiquettes et les tags existent.
   */
  protected async research(): Promise<void> {
    this.loading.set(true);
    await this.load();
  }

  constructor() {
    void this.load();
  }

  protected label(image: LibraryMediaView): string {
    return image.name === '' ? (image.url.split('/').at(-1) ?? image.url) : image.name;
  }

  protected isPicked(url: string): boolean {
    return this.picked().includes(url);
  }

  /** Cette image est-elle déjà portée ? */
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
   * un porteur les choisit dans l'ordre où il veut les voir, et le lui
   * réordonner en douce l'obligerait à tout replacer ensuite.
   */
  protected confirm(): void {
    const byUrl = new Map(this.images().map((image) => [image.url, image]));
    this.ref.close(
      this.picked().flatMap((url) => {
        const image = byUrl.get(url);
        return image === undefined
          ? []
          : [
              {
                url,
                name: image.name,
                width: image.width,
                height: image.height,
                bytes: image.bytes,
                contentType: image.contentType,
              },
            ];
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
      const page = await this.api.page(PAGE_SIZE, 0, this.search());
      this.images.set(page.items);
    } catch {
      this.failure.set("La médiathèque n'a pas pu être lue.");
    } finally {
      this.loading.set(false);
    }
  }
}
