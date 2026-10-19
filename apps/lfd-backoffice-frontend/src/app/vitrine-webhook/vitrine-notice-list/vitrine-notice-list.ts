import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { VitrineNoticeView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import {
  NOTICE_OUTCOME_LABELS,
  NOTICE_OUTCOME_VARIANTS,
  noticeAuthor,
  noticeOutcome,
  unattemptedCount,
} from '../vitrine-notice-format';

/**
 * **Les dernières annonces** aux abonnés : l'objet, le message, qui l'a
 * envoyée (par son nom), et l'issue par destinataire. « Accepté » dit que le
 * fournisseur a pris l'e-mail en charge — pas qu'il est arrivé.
 *
 * Une annonce interrompue garde des destinataires « pas tentés » :
 * « Reprendre l'envoi » (avec l'écriture) n'écrit qu'à ceux-là.
 */
@Component({
  selector: 'app-vitrine-notice-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './vitrine-notice-list.html',
  styleUrl: './vitrine-notice-list.scss',
})
export class VitrineNoticeList {
  readonly notices = input.required<readonly VitrineNoticeView[]>();
  readonly canWrite = input(false);
  /** L'annonce dont la reprise est en cours, ou `null`. */
  readonly busy = input<string | null>(null);
  readonly resume = output<VitrineNoticeView>();

  protected readonly author = noticeAuthor;
  protected readonly unattempted = unattemptedCount;

  protected readonly outcome = noticeOutcome;
  protected readonly labels = NOTICE_OUTCOME_LABELS;
  protected readonly variants = NOTICE_OUTCOME_VARIANTS;
}
