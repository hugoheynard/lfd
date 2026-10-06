import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DriverNoticeView } from '@lfd/contracts';
import { FoldElementTitleComponent } from 'fold-ng';

/**
 * Le texte d'information du livreur, tel que le serveur le sert — rien n'est
 * écrit ici : la source est unique (`driver-information-notice.ts`, côté API).
 * Partagé par le dialogue du départ et la page « Mes données ».
 */
@Component({
  selector: 'app-driver-notice-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldElementTitleComponent],
  templateUrl: './driver-notice-text.html',
  styleUrl: './driver-notice-text.scss',
})
export class DriverNoticeText {
  readonly notice = input.required<DriverNoticeView>();
}
