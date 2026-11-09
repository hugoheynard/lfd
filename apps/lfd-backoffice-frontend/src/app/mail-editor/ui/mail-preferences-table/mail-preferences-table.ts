import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { MailPreferenceListItemView } from '@lfd/contracts';
import { MAIL_SPACE_LABELS } from '@lfd/mail-blocks';
import {
  FoldBadgeComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';

import {
  MAIL_CONSENT_ORIGIN_LABELS,
  mailPreferenceBadge,
  mailPreferenceLastAt,
  mailPreferenceRecipient,
  mailPreferenceWhere,
} from '../../rules/mail-preference-labels';
import { mailSendWhen } from '../../rules/mail-send-labels';

/**
 * **La liste des désinscriptions et accords** (lot C4) : l'état en pastille,
 * l'espace, l'adresse masquée telle que servie, l'origine, le lieu, la date
 * du dernier geste. L'ordre est celui du serveur ; un clic ouvre la ligne.
 */
@Component({
  selector: 'app-mail-preferences-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldDataTableCellDirective, FoldDataTableComponent],
  templateUrl: './mail-preferences-table.html',
})
export class MailPreferencesTable {
  readonly rows = input.required<readonly MailPreferenceListItemView[]>();
  readonly empty = input.required<FoldTableEmpty>();
  readonly opened = output<MailPreferenceListItemView>();

  protected readonly columns: readonly FoldTableColumn<MailPreferenceListItemView>[] = [
    { key: 'status', label: 'État' },
    { key: 'space', label: 'Espace' },
    { key: 'recipient', label: 'Adresse' },
    { key: 'origin', label: 'Origine' },
    { key: 'place', label: 'Lieu' },
    { key: 'lastAt', label: 'Dernier geste' },
  ];

  protected readonly rowKey = (row: MailPreferenceListItemView): string => row.id;

  protected badgeOf(row: MailPreferenceListItemView) {
    return mailPreferenceBadge(row);
  }

  protected spaceOf(row: MailPreferenceListItemView): string {
    return MAIL_SPACE_LABELS[row.space];
  }

  protected recipientOf(row: MailPreferenceListItemView): string {
    return mailPreferenceRecipient(row);
  }

  protected originOf(row: MailPreferenceListItemView): string {
    return row.origin === null ? '' : MAIL_CONSENT_ORIGIN_LABELS[row.origin];
  }

  protected whereOf(row: MailPreferenceListItemView): string {
    return mailPreferenceWhere(row);
  }

  protected whenOf(row: MailPreferenceListItemView): string {
    const at = mailPreferenceLastAt(row);
    return at === null ? '' : mailSendWhen(at);
  }
}
