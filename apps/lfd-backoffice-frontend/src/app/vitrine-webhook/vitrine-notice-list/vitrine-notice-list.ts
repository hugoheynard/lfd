import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { VitrineNoticeView } from '@lfd/contracts';
import { FoldBadgeComponent, FoldCardComponent, FoldElementTitleComponent } from 'fold-ng';

import {
  NOTICE_OUTCOME_LABELS,
  NOTICE_OUTCOME_VARIANTS,
  noticeOutcome,
} from '../vitrine-notice-format';

/**
 * **Les dernières annonces** aux abonnés : l'objet, le message, qui l'a
 * envoyée, et l'issue par destinataire. « Accepté » dit que le fournisseur a
 * pris l'e-mail en charge — pas qu'il est arrivé.
 */
@Component({
  selector: 'app-vitrine-notice-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FoldBadgeComponent, FoldCardComponent, FoldElementTitleComponent],
  templateUrl: './vitrine-notice-list.html',
  styleUrl: './vitrine-notice-list.scss',
})
export class VitrineNoticeList {
  readonly notices = input.required<readonly VitrineNoticeView[]>();

  protected readonly outcome = noticeOutcome;
  protected readonly labels = NOTICE_OUTCOME_LABELS;
  protected readonly variants = NOTICE_OUTCOME_VARIANTS;
}
