import { ChangeDetectionStrategy, Component, computed, inject, type OnInit } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { mailLabel, mailWhoAndWhen } from '../../rules/mail-labels';
import { MailCopyStore } from '../../state/mail-copy-store';
import { MailDraftWriter } from '../../state/mail-draft-writer';
import { MailList } from '../mail-list/mail-list';
import { MailPreview } from '../mail-preview/mail-preview';
import { MailTextEditor } from '../mail-text-editor/mail-text-editor';

/**
 * **Communication › Textes des e-mails** (`plan-textes-des-e-mails.md`, C3,
 * C4, C8, lot E3) — la liste des e-mails par destinataire puis par moment,
 * les textes de l'e-mail ouvert en trois langues côte à côte, et son aperçu.
 * En tête, ce qui attend « Publier » : un e-mail parti est parti, rien ne
 * change pour les destinataires avant ce geste.
 *
 * Sous `b2b_storefront:read` (la route) ; écrire, publier et s'envoyer un
 * essai demandent `:write`, que le store lit.
 */
@Component({
  selector: 'app-mail-copy-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MailCopyStore, MailDraftWriter],
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    MailList,
    MailPreview,
    MailTextEditor,
  ],
  templateUrl: './mail-copy-page.html',
  styleUrl: './mail-copy-page.scss',
})
export class MailCopyPage implements OnInit {
  protected readonly store = inject(MailCopyStore);
  private readonly writer = inject(MailDraftWriter);

  protected readonly title = computed(() => {
    const mail = this.store.current();
    return mail === null ? '' : mailLabel(mail.mail).title;
  });

  protected readonly whoAndWhen = computed(() => {
    const mail = this.store.current();
    return mail === null ? '' : mailWhoAndWhen(mail.mail);
  });

  ngOnInit(): void {
    void this.store.load();
  }

  /** Publier envoie d'abord la frappe en attente : on publie ce qu'on voit. */
  protected async publish(): Promise<void> {
    await this.writer.flush();
    await this.store.publish();
  }

  protected pendingLabel(count: number): string {
    return count === 1 ? '1 modification en attente' : `${count} modifications en attente`;
  }
}
