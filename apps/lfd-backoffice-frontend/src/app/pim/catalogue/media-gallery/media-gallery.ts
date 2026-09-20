import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { readLocalized, type Locale, type LocalizedText } from '@lfd/pim-contracts';

import { FoldButtonIconComponent, FoldFileDropzoneComponent } from 'fold-ng';

/**
 * Un visuel tel que la galerie l'affiche — le plus PETIT dénominateur des deux
 * porteurs. `alt` est facultatif parce qu'une fiche peut en manquer ; une
 * famille en a toujours un, le serveur le remplit avec l'URL.
 */
export interface GallerySlot {
  readonly url: string;
  readonly name: string;
  readonly alt?: LocalizedText | undefined;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly bytes?: number | null;
  readonly contentType?: string | null;
}

/** Le plus grand diviseur commun — pour réduire un ratio à sa forme lisible. */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Le format, tel qu'on le nomme — « image/jpeg » est un type MIME, pas un mot. */
function formatOf(contentType: string): string {
  const subtype = contentType.split('/')[1] ?? contentType;
  return subtype.toUpperCase();
}

/** Le poids d'un fichier, en unités qu'un humain lit. */
function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${String(Math.round(bytes / 1024))} ko`
    : `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * La galerie de visuels — **présentationnelle**, et rien d'autre.
 *
 * Elle vivait dans la section Visuels d'une fiche produit, soudée à son store.
 * Une FAMILLE en porte aussi désormais, et dupliquer soixante-quinze lignes de
 * gabarit aurait garanti que les deux divergent : un liseré corrigé d'un côté,
 * une pastille de format ajoutée de l'autre.
 *
 * Elle ne connaît donc ni fiche ni famille : on lui donne des tuiles, elle
 * signale les clics. Le dépôt est la DERNIÈRE tuile, à la place qu'occuperait
 * l'image suivante — le geste est là où le regard finit, pas en bas de section.
 */
@Component({
  selector: 'app-media-gallery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonIconComponent, FoldFileDropzoneComponent],
  templateUrl: './media-gallery.html',
  styleUrl: './media-gallery.scss',
})
export class MediaGallery {
  readonly slots = input.required<readonly GallerySlot[]>();
  /** La langue dans laquelle on LIT les textes alternatifs. */
  readonly locale = input.required<Locale>();
  /** Les index dont la description est incomplète — ils portent le liseré. */
  readonly incomplete = input<readonly number[]>([]);
  /** Un dépôt est en cours. */
  readonly busy = input(false);

  readonly edit = output<number>();
  readonly picked = output<File>();

  protected isIncomplete(index: number): boolean {
    return this.incomplete().includes(index);
  }

  /** L'alternative dans la langue lue — repli sur la source, jamais du vide. */
  protected altOf(slot: GallerySlot): string {
    return slot.alt === undefined ? '' : readLocalized(slot.alt, this.locale());
  }

  /**
   * La FORME du fichier, réduite — « 4:3 », « 16:9 », « 1:1 ».
   *
   * La vignette recadre pour que la galerie reste homogène : bon arbitrage pour
   * comparer des images, mais il cache la forme réelle du fichier. Rien à dire
   * d'une image non mesurée : une pastille vide vaudrait mieux que rien, une
   * pastille FAUSSE serait pire que les deux.
   */
  protected ratioOf(slot: GallerySlot): string | undefined {
    const { width, height } = slot;
    if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) {
      return undefined;
    }
    const divisor = gcd(width, height);
    const w = width / divisor;
    const h = height / divisor;
    // Réduit, un capteur donne parfois « 4288:2848 » : illisible, donc on
    // retombe sur une décimale plutôt qu'une fraction de recensement.
    return w <= 32 && h <= 32 ? `${String(w)}:${String(h)}` : `${(width / height).toFixed(2)}:1`;
  }

  /** Résolution, poids, format — ce qu'on a CONSTATÉ dans les octets au dépôt. */
  protected metaOf(slot: GallerySlot): string {
    const { width, height, bytes, contentType } = slot;
    if (typeof width !== 'number' || typeof height !== 'number') {
      return 'Dimensions inconnues';
    }
    const parts = [`${String(width)} × ${String(height)}`];
    if (typeof bytes === 'number') {
      parts.push(formatBytes(bytes));
    }
    if (typeof contentType === 'string' && contentType !== '') {
      parts.push(formatOf(contentType));
    }
    return parts.join(' · ');
  }

  protected pick(files: readonly File[]): void {
    const file = files[0];
    if (file !== undefined) {
      this.picked.emit(file);
    }
  }
}
