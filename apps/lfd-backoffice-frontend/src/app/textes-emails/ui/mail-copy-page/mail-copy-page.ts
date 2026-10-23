import { ChangeDetectionStrategy, Component, computed, inject, type OnInit } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
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
import { canResetOrder, orderPending, unplacedTexts } from '../../rules/mail-sections';
import { MailCopyStore } from '../../state/mail-copy-store';
import { MailDraftWriter } from '../../state/mail-draft-writer';
import { MailList } from '../mail-list/mail-list';
import { MailPreview } from '../mail-preview/mail-preview';
import { MailSectionCard } from '../mail-section-card/mail-section-card';
import { MailTextEditor } from '../mail-text-editor/mail-text-editor';

/**
 * **Communication › Textes des e-mails** (`plan-textes-des-e-mails.md`, C3,
 * C4, C8, lot E3) — la liste des e-mails par destinataire puis par moment,
 * l'e-mail ouvert en cartes — ses deux cadres (objet, en-tête), puis une
 * carte par section dans l'ordre du brouillon (E4b), chacune avec ses textes
 * en trois langues côte à côte — et son aperçu, qui répond aux cartes.
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
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
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
    MailSectionCard,
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

  protected readonly orderChanged = computed(() => {
    const mail = this.store.current();
    return mail !== null && orderPending(mail.sectionOrder);
  });

  protected readonly canResetOrder = computed(() => {
    const mail = this.store.current();
    return mail !== null && canResetOrder(mail.sectionOrder);
  });

  protected readonly unplaced = computed(() => {
    const mail = this.store.current();
    return mail === null ? [] : unplacedTexts(mail);
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

  protected defaultChangedLabel(count: number): string {
    return count === 1 ? '1 texte à relire' : `${count} textes à relire`;
  }
}
