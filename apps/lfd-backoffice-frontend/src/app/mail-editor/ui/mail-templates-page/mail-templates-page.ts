import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { httpErrorMessage } from '@lfd/endpoints';
import type { MailAudience, MailEditorListItem } from '@lfd/mail-blocks';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldMenuComponent,
  FoldMenuItemComponent,
  FoldMenuSeparatorComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  type FoldIconName,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { mailLabel, mailWhoAndWhen } from '../../../textes-emails/rules/mail-labels';
import { MailEditorService } from '../../data/mail-editor.service';
import { groupMailTemplates } from '../../rules/mail-template-groups';

const AUDIENCE_ICONS: Readonly<Record<MailAudience, FoldIconName>> = {
  customer: 'user',
  team: 'team',
  agency: 'company',
};

/**
 * **Les e-mails** (§ 6, S5a) : la liste de l'éditeur, rangée par
 * destinataire puis par moment. Un clic ouvre la page de l'e-mail ; ce qui a
 * un brouillon en cours le dit.
 *
 * S5e : « Publier tous les e-mails » met en service les phrases en attente
 * de TOUS les e-mails, comptées par `copyPendingCount` (le document fait foi
 * pour l'ordre, plan § 21 : l'ordre des sections n'est plus un geste). Les brouillons
 * d'arrangement n'en sont pas : chacun se publie depuis son e-mail. Le refus
 * du serveur (`409` : rien n'attend) s'affiche tel qu'il le dit.
 */
@Component({
  selector: 'app-mail-templates-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldMenuComponent,
    FoldMenuItemComponent,
    FoldMenuSeparatorComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    RouterLink,
  ],
  templateUrl: './mail-templates-page.html',
  styleUrl: './mail-templates-page.scss',
})
export class MailTemplatesPage {
  private readonly api = inject(MailEditorService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly icons = AUDIENCE_ICONS;
  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string | null>(null);
  private readonly mails = signal<readonly MailEditorListItem[]>([]);
  protected readonly groups = computed(() => groupMailTemplates(this.mails()));
  /** Phrases (toutes langues) qui attendent « Publier tous les e-mails ». */
  protected readonly copyPendingCount = signal(0);
  protected readonly publishing = signal(false);
  /** Le dernier refus de la publication de tous les e-mails, tel que le serveur l'a dit. */
  protected readonly publishError = signal<string | null>(null);
  protected readonly canWrite = computed(() => this.permissions.can('mail_templates:write'));
  protected readonly pendingLabel = computed(() => {
    const count = this.copyPendingCount();
    return count === 1 ? '1 modification en attente' : `${count} modifications en attente`;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.status.set('loading');
    try {
      const view = await this.api.list();
      this.mails.set(view.mails);
      this.copyPendingCount.set(view.copyPendingCount);
      this.error.set(null);
      this.status.set('ready');
    } catch (error) {
      this.error.set(httpErrorMessage(error, 'La liste des e-mails n’a pas pu être lue.'));
      this.status.set('failed');
    }
  }

  /** Publie les phrases en attente de tous les e-mails, puis relit la liste. */
  async publishAll(): Promise<void> {
    if (!this.canWrite() || this.publishing()) {
      return;
    }
    this.publishing.set(true);
    this.publishError.set(null);
    try {
      const { publicationVersion } = await this.api.publishAll();
      this.notify.success(`Publié — version des textes ${publicationVersion}.`);
      await this.load();
    } catch (error) {
      this.publishError.set(httpErrorMessage(error, 'Les e-mails n’ont pas pu être publiés.'));
    } finally {
      this.publishing.set(false);
    }
  }

  protected title(mail: MailEditorListItem): string {
    return mailLabel(mail.template).title;
  }

  protected hint(mail: MailEditorListItem): string {
    const whoAndWhen = mailWhoAndWhen(mail.template);
    return whoAndWhen === '' ? mail.template : `${whoAndWhen} — ${mail.template}`;
  }

  protected badge(mail: MailEditorListItem): string | undefined {
    return mail.hasDraft ? 'Brouillon' : undefined;
  }
}
