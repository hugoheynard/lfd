import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { httpErrorMessage } from '@lfd/endpoints';
import { isMailSpace, MAIL_SPACE_LABELS, type MailEditorListItem } from '@lfd/mail-blocks';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldMenuComponent,
  FoldMenuItemComponent,
  FoldMenuSeparatorComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { mailLabel, mailWhoAndWhen } from '../../../textes-emails/rules/mail-labels';
import { MailEditorService } from '../../data/mail-editor.service';
import { mailSpaceListing } from '../../rules/mail-template-spaces';
import { MailSenderCard } from '../mail-sender-card/mail-sender-card';

/**
 * **Un espace d'e-mails** (plan § 25, C2 — retouche du 2026-11-07, Hugo :
 * « la première page d'e-mail peut être une card par espace […] un espace
 * détail avec la liste des mails ») : ses e-mails, rangés par destinataire
 * puis par moment, les internes sous « Interne » ; l'accès à sa charte en
 * en-tête. Un clic ouvre la page de l'e-mail ; ce qui a un brouillon le dit.
 *
 * La liste est celle de `GET /admin/mail-templates`, filtrée à l'espace : le
 * serveur ne la sert pas par espace (C1).
 */
@Component({
  selector: 'app-mail-space-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldMenuComponent,
    FoldMenuItemComponent,
    FoldMenuSeparatorComponent,
    FoldPageLayoutComponent,
    MailSenderCard,
    RouterLink,
  ],
  templateUrl: './mail-space-page.html',
  styleUrl: './mail-space-page.scss',
})
export class MailSpacePage {
  private readonly api = inject(MailEditorService);

  /** Le segment de route `:space` (`withComponentInputBinding`). */
  readonly space = input.required<string>();

  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly mails = signal<readonly MailEditorListItem[]>([]);
  protected readonly listing = computed(() => mailSpaceListing(this.mails(), this.space()));
  protected readonly title = computed(() => {
    const space = this.space();
    return isMailSpace(space) ? MAIL_SPACE_LABELS[space] : 'Espace inconnu';
  });

  constructor() {
    // Le segment de route n'est lisible qu'après la création : on relit quand il change.
    effect(() => {
      this.space();
      void this.load();
    });
  }

  protected async load(): Promise<void> {
    const space = this.space();
    if (!isMailSpace(space)) {
      this.error.set(`« ${space} » n’est pas un espace d’e-mails.`);
      this.status.set('failed');
      return;
    }
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

  protected mailTitle(mail: MailEditorListItem): string {
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
