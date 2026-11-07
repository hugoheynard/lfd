import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { httpErrorMessage } from '@lfd/endpoints';
import type { MailAudience, MailEditorListItem } from '@lfd/mail-blocks';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldMenuComponent,
  FoldMenuItemComponent,
  FoldMenuSeparatorComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  type FoldIconName,
} from 'fold-ng';

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
 */
@Component({
  selector: 'app-mail-templates-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
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

  protected readonly icons = AUDIENCE_ICONS;
  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string | null>(null);
  private readonly mails = signal<readonly MailEditorListItem[]>([]);
  protected readonly groups = computed(() => groupMailTemplates(this.mails()));

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.status.set('loading');
    try {
      const view = await this.api.list();
      this.mails.set(view.mails);
      this.error.set(null);
      this.status.set('ready');
    } catch (error) {
      this.error.set(httpErrorMessage(error, 'La liste des e-mails n’a pas pu être lue.'));
      this.status.set('failed');
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
