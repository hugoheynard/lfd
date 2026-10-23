import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { MailAudience, MailCopyMailView } from '@lfd/contracts';
import {
  FoldMenuComponent,
  FoldMenuItemComponent,
  FoldMenuSeparatorComponent,
  FoldPageSectionComponent,
  type FoldIconName,
} from 'fold-ng';

import { mailLabel } from '../../rules/mail-labels';
import { MailCopyStore } from '../../state/mail-copy-store';

const AUDIENCE_ICONS: Readonly<Record<MailAudience, FoldIconName>> = {
  customer: 'user',
  team: 'team',
  agency: 'company',
};

/**
 * **La liste des e-mails** (C8) : par destinataire — Clients, Équipe, Agence —
 * puis par moment, chacun sous son intitulé lisible, avec ce qui attend
 * « Publier ». Un clic ouvre l'e-mail.
 */
@Component({
  selector: 'app-mail-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldMenuComponent,
    FoldMenuItemComponent,
    FoldMenuSeparatorComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './mail-list.html',
  styleUrl: './mail-list.scss',
})
export class MailList {
  protected readonly store = inject(MailCopyStore);
  protected readonly icons = AUDIENCE_ICONS;

  protected title(mail: MailCopyMailView): string {
    return mailLabel(mail.mail).title;
  }

  protected badge(mail: MailCopyMailView): string | undefined {
    return mail.pendingCount > 0 ? `${mail.pendingCount} à publier` : undefined;
  }
}
