import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ContactMessageStatus, ContactMessageView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { factWhen } from '../../../shared/journal/units';
import { CONTACT_AUDIENCE_LABELS } from '../contact-audience';
import { CONTACT_PRIORITY_LABELS, CONTACT_PRIORITY_VARIANTS } from '../contact-priority';
import { ContactInbox } from '../contact-inbox.store';
import { ContactService } from '../contact.service';

type LoadState = 'loading' | 'ready' | 'error';

const STATUSES: readonly FoldViewToggleOption[] = [
  { value: 'pending', label: 'À traiter' },
  { value: 'handled', label: 'Traités' },
];
const STATUS_VALUES: readonly ContactMessageStatus[] = ['pending', 'handled'];

/** Un message, et ce que l'écran en dit autour de son texte. */
interface MessageRow {
  readonly message: ContactMessageView;
  readonly subtitle: string;
  readonly handled: string | null;
}

/**
 * **Contact › Messagerie** — ce qui a été écrit par « Nous
 * écrire », à traiter puis traité (plan « Nous écrire », §2.3). La cloche du
 * back-office y mène (`CONTACT_MESSAGES_LINK` côté API).
 *
 * Le message est aussi parti par e-mail à l'adresse de son objet : « Marquer
 * traité » dit à l'équipe que quelqu'un a répondu. Un second traitement est
 * refusé par le serveur (409), dont le message est affiché tel quel — c'est
 * lui qui sait qui l'a traité.
 */
@Component({
  selector: 'app-contact-messages',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldViewToggleComponent,
    RouterLink,
  ],
  templateUrl: './contact-messages.html',
  styleUrl: './contact-messages.scss',
})
export class ContactMessages {
  private readonly api = inject(ContactService);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);

  protected readonly statuses = STATUSES;
  protected readonly priorityLabels = CONTACT_PRIORITY_LABELS;
  protected readonly priorityVariants = CONTACT_PRIORITY_VARIANTS;
  private readonly inbox = inject(ContactInbox);
  protected readonly tab = signal<ContactMessageStatus>('pending');
  protected readonly canWrite = computed(() => this.permissions.can('b2b_contact:write'));
  protected readonly state = signal<LoadState>('loading');
  private readonly messages = signal<readonly ContactMessageView[]>([]);
  /** Le message dont le traitement est en vol ; `null` au repos. */
  protected readonly busyId = signal<string | null>(null);
  protected readonly refusal = signal<string | null>(null);

  protected readonly rows = computed<readonly MessageRow[]>(() =>
    this.messages().map((message) => ({
      message,
      subtitle: `${CONTACT_AUDIENCE_LABELS[message.audience]} · reçu le ${factWhen(message.receivedAt)}`,
      handled:
        message.handledAt === null
          ? null
          : `Traité le ${factWhen(message.handledAt)}${message.handledBy === null ? '' : ` par ${message.handledBy}`}.`,
    })),
  );

  constructor() {
    void this.load();
  }

  protected selectTab(value: string): void {
    const tab = STATUS_VALUES.find((status) => status === value);
    if (tab === undefined) return;
    this.tab.set(tab);
    this.refusal.set(null);
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.show(await this.api.messages(this.tab()));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected async markHandled(message: ContactMessageView): Promise<void> {
    if (this.busyId() !== null || !this.canWrite()) return;
    this.busyId.set(message.id);
    this.refusal.set(null);
    try {
      await this.api.markHandled(message.id);
      this.notify.success('Message marqué traité.');
      this.show(await this.api.messages(this.tab()));
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "Le message n'a pas pu être marqué traité."));
    } finally {
      this.busyId.set(null);
    }
  }

  /** Pose la liste ; celle « à traiter » donne aussi le compteur de l'onglet. */
  private show(messages: readonly ContactMessageView[]): void {
    this.messages.set(messages);
    if (this.tab() === 'pending') this.inbox.set(messages.length);
  }
}
