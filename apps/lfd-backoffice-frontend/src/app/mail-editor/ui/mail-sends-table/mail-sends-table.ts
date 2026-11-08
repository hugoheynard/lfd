import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MailSendListItemView } from '@lfd/contracts';
import { MAIL_SPACE_LABELS } from '@lfd/mail-blocks';
import {
  FoldBadgeComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';

import { mailLabel } from '../../rules/mail-labels';
import { mailSendBadge, mailSendWhen, type MailSendBadge } from '../../rules/mail-send-labels';
import { mailSubjectDisplay, type MailSubjectDisplay } from '../../rules/mail-subjects';

/**
 * **La liste des envois** : pastille (état + retour), modèle par son
 * intitulé, espace, adresse masquée telle que servie, date. L'ordre est
 * celui du serveur — les problèmes d'abord ; une ligne à problème est
 * teintée en plus de sa pastille, jamais à sa place. Un clic ouvre l'envoi.
 * Ses sujets (`le-sujet-des-e-mails.md`, règle 9) : une commande mène à
 * sa fiche — le clic sur le lien n'ouvre pas l'envoi —, le reste se lit.
 */
@Component({
  selector: 'app-mail-sends-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldBadgeComponent, FoldDataTableCellDirective, FoldDataTableComponent],
  templateUrl: './mail-sends-table.html',
  styleUrl: './mail-sends-table.scss',
})
export class MailSendsTable {
  readonly rows = input.required<readonly MailSendListItemView[]>();
  readonly empty = input.required<FoldTableEmpty>();
  readonly opened = output<MailSendListItemView>();

  protected readonly columns: readonly FoldTableColumn<MailSendListItemView>[] = [
    { key: 'state', label: 'État' },
    { key: 'template', label: 'Modèle' },
    { key: 'space', label: 'Espace' },
    { key: 'recipient', label: 'Destinataire' },
    { key: 'subjects', label: 'Sujet' },
    { key: 'requestedAt', label: 'Demandé le' },
  ];

  protected readonly rowKey = (row: MailSendListItemView): string => row.id;
  protected readonly toneOf = (row: MailSendListItemView): 'alert' | null =>
    row.problem ? 'alert' : null;

  protected badgeOf(row: MailSendListItemView): MailSendBadge {
    return mailSendBadge(row);
  }

  protected titleOf(row: MailSendListItemView): string {
    return mailLabel(row.template).title;
  }

  protected spaceOf(row: MailSendListItemView): string {
    return MAIL_SPACE_LABELS[row.space];
  }

  protected subjectsOf(row: MailSendListItemView): readonly MailSubjectDisplay[] {
    return row.subjects.map(mailSubjectDisplay);
  }

  protected whenOf(row: MailSendListItemView): string {
    return mailSendWhen(row.requestedAt);
  }
}
