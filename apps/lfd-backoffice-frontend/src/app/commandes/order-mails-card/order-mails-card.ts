import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrderMailView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { mailLabel } from '../../mail-editor/rules/mail-labels';
import {
  mailSendBadge,
  mailSendWhen,
  type MailSendBadge,
} from '../../mail-editor/rules/mail-send-labels';
import { OrderMailsStore } from '../order-mails.store';

/** La phrase d'un retour qui demande un geste au staff. */
const FAILURE_SENTENCES: Readonly<Partial<Record<string, string>>> = {
  bounced: 'Adresse rejetée : vérifiez l’adresse du client.',
  complained: 'Le client l’a signalé comme spam : préférez le téléphone.',
};

/** Une ligne de la carte, mise en mots. */
interface OrderMailLine {
  readonly id: string;
  readonly template: string;
  readonly title: string;
  readonly when: string;
  readonly badge: MailSendBadge;
  readonly failure: string | null;
}

/**
 * **« E-mails »** sur la fiche d'une commande (`le-sujet-des-e-mails.md`,
 * lot E3) : chaque e-mail demandé pour elle, du plus récent au plus ancien,
 * avec l'état que le suivi en connaît — les mots du suivi des envois, pas
 * d'autres. Un rebond ou une plainte se dit en phrase : il faut joindre le
 * client autrement.
 *
 * Le vide est honnête : les commandes d'avant les sujets n'ont aucun e-mail
 * suivi, elles n'en ont pas moins reçu. Qui a `mail_sends:read` passe d'une
 * ligne à son détail dans le suivi.
 */
@Component({
  selector: 'app-order-mails-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './order-mails-card.html',
  styleUrl: './order-mails-card.scss',
})
export class OrderMailsCard {
  readonly orderId = input.required<string>();

  private readonly store = inject(OrderMailsStore);
  private readonly permissions = inject(PermissionsStore);

  protected readonly state = this.store.state;
  protected readonly canOpenSends = computed(() => this.permissions.can('mail_sends:read'));
  protected readonly lines = computed(() => this.store.items().map(toLine));

  constructor() {
    effect(() => {
      const id = this.orderId();
      untracked(() => this.store.ensure(id));
    });
  }

  protected retry(): void {
    void this.store.reload(this.orderId());
  }
}

function toLine(mail: OrderMailView): OrderMailLine {
  return {
    id: mail.id,
    template: mail.template,
    title: mailLabel(mail.template).title,
    when: mailSendWhen(mail.requestedAt),
    badge: mailSendBadge(mail),
    failure: mail.delivery === null ? null : (FAILURE_SENTENCES[mail.delivery] ?? null),
  };
}
