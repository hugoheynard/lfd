import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DEFAULT_IMAGE_FOCAL, type ImageFocal } from '@lfd/mail-blocks';
import { FoldIdService } from 'fold-ng';

import { focalAt } from '../../../mediatheque/rules/image-pointing';
import { focalLabel, nudgedFocal } from '../../rules/mail-image-framing';

/**
 * **La vignette où l'on pose le point focal d'une image d'e-mail** (plan
 * `plan-editeur-par-blocs.md`, § 19, « Format et point focal ») : un clic pose
 * le point en fractions de l'image, les flèches le déplacent, et la position
 * est dite en clair. Sans point posé, le repère est au centre — le défaut du
 * contrat.
 *
 * La cible ÉPOUSE l'image (cf. `focalAt`) : un clic dans une bande autour
 * donnerait une fraction fausse.
 */
@Component({
  selector: 'app-mail-image-focal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mail-image-focal.html',
  styleUrl: './mail-image-focal.scss',
})
export class MailImageFocal {
  readonly src = input.required<string>();
  readonly focal = input<ImageFocal | undefined>(undefined);
  readonly focalChange = output<ImageFocal>();

  protected readonly positionId = inject(FoldIdService).next('mail-image-focal');
  protected readonly point = computed(() => this.focal() ?? DEFAULT_IMAGE_FOCAL);
  protected readonly label = computed(() => focalLabel(this.focal()));

  /** Un clic de souris ; celui qu'Entrée ou Espace simulent (`detail` nul) n'a pas de position. */
  protected onClick(event: MouseEvent): void {
    const target = event.currentTarget;
    if (event.detail === 0 || !(target instanceof HTMLElement)) {
      return;
    }
    const focal = focalAt(event.clientX, event.clientY, target.getBoundingClientRect());
    if (focal !== null) {
      this.focalChange.emit(focal);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const focal = nudgedFocal(this.focal(), event.key);
    if (focal !== null) {
      event.preventDefault();
      this.focalChange.emit(focal);
    }
  }
}
