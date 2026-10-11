import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { FocalPoint } from '@lfd/pim-contracts';
import { FoldButtonComponent, FoldPageSectionComponent } from 'fold-ng';

import { PREVIEW_FRAMES } from '../../../pim/catalogue/media-formats';
import { objectPositionOf } from '../../rules/image-facts';
import { focalAt, percentLabel } from '../../rules/image-pointing';

/**
 * La section **Aperçu et cadrage** du panneau « Décrire une image » — on
 * clique sur le sujet, et les cadres de la boutique montrent ce qu'ils en
 * garderont.
 *
 * Le point vit chez le panneau (`[(focal)]`), qui l'enregistre avec le reste.
 */
@Component({
  selector: 'app-focal-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageSectionComponent, FoldButtonComponent],
  templateUrl: './focal-section.html',
  styleUrl: './focal-section.scss',
})
export class FocalSection {
  readonly url = input.required<string>();
  readonly focal = model<FocalPoint | null>(null);

  /** Les cadres de la table des formats — ceux que la boutique coupe, et le 21/9 des bannières (`mediatheque.md` §6). */
  protected readonly crops = PREVIEW_FRAMES;
  protected readonly objectPosition = computed(() => objectPositionOf(this.focal()));
  protected readonly percent = percentLabel;

  /** Pose le point focal là où l'on clique — en fractions, cf. {@link focalAt}. */
  protected point(event: MouseEvent): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const focal = focalAt(event.clientX, event.clientY, target.getBoundingClientRect());
    if (focal !== null) {
      this.focal.set(focal);
    }
  }

  /** Retire la désignation — distinct de « au centre », qui est un choix. */
  protected unpoint(): void {
    this.focal.set(null);
  }
}
