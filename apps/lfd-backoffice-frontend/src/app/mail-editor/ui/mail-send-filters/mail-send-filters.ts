import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  MAIL_SEND_DELIVERIES,
  MAIL_SEND_REFUSAL_CODES,
  MAIL_SEND_SPACES,
  MAIL_SEND_STATES,
  type MailSendDelivery,
  type MailSendRefusalCode,
  type MailSendSpace,
  type MailSendState,
} from '@lfd/contracts';
import { MAIL_SPACE_LABELS } from '@lfd/mail-blocks';
import {
  FoldButtonComponent,
  FoldCheckboxComponent,
  FoldDateComponent,
  FoldListboxComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { labeledMailTemplates, mailLabel } from '../../rules/mail-labels';
import {
  MAIL_SEND_DELIVERY_LABELS,
  MAIL_SEND_REFUSAL_LABELS,
  MAIL_SEND_STATE_LABELS,
  NO_MAIL_SEND_FILTERS,
  type MailSendFilters as Filters,
} from '../../rules/mail-send-labels';

/**
 * **Les critères du suivi des envois** : espace, modèle, état, retour,
 * raison d'un refus d'e-mail marketing (U4),
 * période, et la bascule des sondes (`scope=probes`, listées à part —
 * `le-suivi-des-e-mails.md`, décision 10). Chaque changement rend les
 * critères entiers ; la page relit la liste.
 */
@Component({
  selector: 'app-mail-send-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCheckboxComponent, FoldDateComponent, FoldListboxComponent],
  templateUrl: './mail-send-filters.html',
  styleUrl: './mail-send-filters.scss',
})
export class MailSendFilters {
  readonly filters = input.required<Filters>();
  readonly filtersChange = output<Filters>();

  protected readonly spaceOptions: readonly FoldSelectOption<MailSendSpace>[] =
    MAIL_SEND_SPACES.map((space) => ({ value: space, label: MAIL_SPACE_LABELS[space] }));
  protected readonly templateOptions: readonly FoldSelectOption<string>[] = labeledMailTemplates()
    .map((template) => ({ value: template, label: mailLabel(template).title }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  protected readonly stateOptions: readonly FoldSelectOption<MailSendState>[] =
    MAIL_SEND_STATES.map((state) => ({ value: state, label: MAIL_SEND_STATE_LABELS[state] }));
  protected readonly deliveryOptions: readonly FoldSelectOption<MailSendDelivery>[] =
    MAIL_SEND_DELIVERIES.map((delivery) => ({
      value: delivery,
      label: MAIL_SEND_DELIVERY_LABELS[delivery],
    }));

  protected readonly refusalOptions: readonly FoldSelectOption<MailSendRefusalCode>[] =
    MAIL_SEND_REFUSAL_CODES.map((refusal) => ({
      value: refusal,
      label: MAIL_SEND_REFUSAL_LABELS[refusal],
    }));

  protected change(patch: Partial<Filters>): void {
    this.filtersChange.emit({ ...this.filters(), ...patch });
  }

  /** Un jour effacé rend `''` : c'est l'absence de borne. */
  protected changeDay(edge: 'from' | 'to', day: string): void {
    this.change({ [edge]: day === '' ? null : day });
  }

  protected changeProbes(probes: boolean): void {
    this.change({ scope: probes ? 'probes' : 'regular' });
  }

  protected reset(): void {
    this.filtersChange.emit({ ...NO_MAIL_SEND_FILTERS, scope: this.filters().scope });
  }
}
