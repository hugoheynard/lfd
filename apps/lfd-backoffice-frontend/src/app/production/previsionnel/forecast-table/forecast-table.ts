import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FoldBadgeComponent, FoldSurfaceDirective } from 'fold-ng';

import type { ForecastRayon } from '../previsionnel-matrix';
import type { ForecastColumn, ForecastFootRow } from '../forecast-column';

/**
 * Au-delà de ce nombre de références, la grille passe en **densité réduite**.
 *
 * La référence tient à vingt-deux lignes ; vers la quarantaine, la matrice
 * déborde en hauteur et l'écran perd sa raison d'être — on ne voit plus la
 * période d'un coup. Replier un rayon reste le geste principal ; ce seuil-ci
 * est ce qui agit **sans qu'on demande rien**, pour que le premier affichage
 * tienne.
 */
const DENSE_ABOVE = 24;

/**
 * **La matrice, dessinée** — les colonnes, les rayons, les chiffres, et rien
 * d'autre.
 *
 * ## Ce qu'elle ne sait pas
 *
 * 🔴 Elle ne charge rien, n'appelle aucun service, ne connaît ni la plage
 * ouverte, ni l'URL, ni le catalogue. Elle reçoit des colonnes et des rayons
 * déjà rangés, et elle les rend. C'est ce qui la rend éprouvable sans HTTP :
 * on lui passe trois rayons et on lit ce qu'elle produit.
 *
 * ## Ce qu'elle décide, en revanche
 *
 * Le **repli d'un rayon** et la **densité** vivent ici, et pas chez la page :
 * ce sont des états d'affichage de la grille, sans effet ailleurs. Les faire
 * remonter aurait obligé la page à tenir un état dont elle ne fait rien — et
 * le prochain écran qui réutiliserait la table devrait le tenir aussi.
 *
 * ## Ce qui tient les colonnes ensemble
 *
 * Le gabarit est posé **une fois**, sur la grille, et hérité par chaque ligne.
 * Sept en-têtes, N lignes produit et deux pieds qui recopieraient le même
 * gabarit finiraient par diverger — et une colonne décalée ment sur chacun de
 * ses chiffres.
 */
@Component({
  selector: 'app-forecast-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldSurfaceDirective],
  templateUrl: './forecast-table.html',
  styleUrl: './forecast-table.scss',
})
export class ForecastTable {
  /**
   * Les colonnes, déjà titrées, marquées et ordonnées — des jours pour le
   * prévisionnel, des tranches pour la journée (`forecast-column.ts`).
   */
  readonly columns = input.required<readonly ForecastColumn[]>();

  /** Les lignes du pied ; chaque colonne porte ses valeurs dans le même ordre. */
  readonly footRows = input.required<readonly ForecastFootRow[]>();

  /** Le nom de la grille, pour les lecteurs d'écran. */
  readonly label = input('Prévisionnel de production');

  /** Les rayons, déjà groupés et triés — la table ne range rien. */
  readonly rayons = input.required<readonly ForecastRayon[]>();

  /** Les rayons repliés — l'issue du débordement, et un geste de l'équipe. */
  private readonly folded = signal<ReadonlySet<string>>(new Set());

  protected readonly references = computed(() =>
    this.rayons().reduce((sum, rayon) => sum + rayon.lines.length, 0),
  );

  /** La grille se resserre d'elle-même quand elle devient trop haute. */
  protected readonly dense = computed(() => this.references() > DENSE_ABOVE);

  /** `230px` pour le produit, puis des colonnes strictement égales. */
  protected readonly template = computed(
    () => `230px repeat(${String(this.columns().length)}, minmax(0, 1fr))`,
  );

  /**
   * La largeur minimale d'une ligne : la référence (60rem, sept jours), ou
   * plus quand les colonnes sont nombreuses — une journée à douze tranches ne
   * s'écrase pas, elle défile à l'horizontale.
   */
  protected readonly rowMin = computed(
    () => `max(60rem, calc(230px + ${String(this.columns().length)} * 6rem))`,
  );

  protected isFolded(label: string): boolean {
    return this.folded().has(label);
  }

  /**
   * Replie ou déplie un rayon. Le geste est **par rayon**, pas global : on garde
   * celui qu'on travaille sous les yeux et on range les autres.
   */
  protected toggleRayon(label: string): void {
    const folded = new Set(this.folded());
    if (!folded.delete(label)) {
      folded.add(label);
    }
    this.folded.set(folded);
  }
}
