import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PAY_LINK_TEST_DAILY_LIMIT, type PayLinkTestView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  type FoldSelectOption,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { GestureIntents } from '../../shared/gesture-intents';
import { copyLink } from '../copy-link';
import { instant } from '../invoice-dossier-format';
import { PayLinkTestsService } from '../pay-link-tests.service';

type State = PayLinkTestView['state'];
type BadgeVariant = 'success' | 'alert' | 'warning' | 'neutral';

const STATE_LABELS: Readonly<Record<State, string>> = {
  sent: 'Envoyé',
  paid: 'Payé',
  refunded: 'Remboursé',
  refund_failed: 'Remboursement échoué',
  expired: 'Expiré',
};

const STATE_VARIANTS: Readonly<Record<State, BadgeVariant>> = {
  sent: 'neutral',
  paid: 'warning',
  refunded: 'success',
  refund_failed: 'alert',
  expired: 'neutral',
};

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'state', label: 'État' },
  { key: 'created', label: 'Créé' },
  { key: 'paid', label: 'Payé le' },
  { key: 'refunded', label: 'Remboursé le' },
  { key: 'link', label: '' },
];

const INTENT_SUBJECT = 'pay-link-test';

/**
 * **Comptabilité › Lien de paiement d'essai** (plan
 * `documentation/payment/plan-lien-de-paiement-d-essai.md`, § 5 et § 8 bis) —
 * envoyer un lien de 1 € à un membre du staff, encaissé puis remboursé
 * automatiquement, et suivre les essais. Le destinataire se choisit dans la
 * liste des membres : aucune adresse libre.
 */
@Component({
  selector: 'app-lien-de-paiement-d-essai-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './lien-de-paiement-d-essai-page.html',
  styleUrl: './lien-de-paiement-d-essai-page.scss',
})
export class LienDePaiementDEssaiPage {
  private readonly api = inject(PayLinkTestsService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);
  private readonly intents = new GestureIntents();

  protected readonly dailyLimit = PAY_LINK_TEST_DAILY_LIMIT;
  protected readonly columns = COLUMNS;
  protected readonly tests = signal<readonly PayLinkTestView[]>([]);
  protected readonly members = signal<readonly FoldSelectOption<string>[]>([]);
  protected readonly membersError = signal<string | null>(null);
  protected readonly recipient = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly sending = signal(false);

  protected readonly canWrite = computed(() => this.permissions.can('pay_link_test:write'));
  protected readonly canSend = computed(
    () => this.canWrite() && this.recipient() !== null && !this.sending(),
  );
  protected readonly rowKey = (row: PayLinkTestView): string => row.id;

  constructor() {
    void this.load();
    if (this.canWrite()) {
      void this.loadMembers();
    }
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.tests.set(await this.api.list());
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'Les essais sont illisibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Les membres actifs du staff : les seuls destinataires possibles. */
  private async loadMembers(): Promise<void> {
    try {
      const recipients = await this.api.recipients();
      this.members.set(
        recipients.map((recipient) => ({ value: recipient.staffUserId, label: recipient.label })),
      );
    } catch (caught) {
      this.membersError.set(httpErrorMessage(caught, 'La liste des membres est illisible.'));
    }
  }

  protected stateLabel(row: PayLinkTestView): string {
    return STATE_LABELS[row.state];
  }

  protected stateVariant(row: PayLinkTestView): BadgeVariant {
    return STATE_VARIANTS[row.state];
  }

  protected createdOf(row: PayLinkTestView): string {
    const by = row.createdByLabel === null ? '' : ` par ${row.createdByLabel}`;
    return `${instant(row.createdAt)}${by}`;
  }

  protected instantOf(iso: string | null): string {
    return iso === null ? '—' : instant(iso);
  }

  protected async send(): Promise<void> {
    const staffUserId = this.recipient();
    if (staffUserId === null || !this.canWrite()) {
      return;
    }
    this.sending.set(true);
    this.actionError.set(null);
    try {
      await this.api.create({ staffUserId }, this.intents.keyFor(INTENT_SUBJECT));
      this.intents.done(INTENT_SUBJECT);
      this.recipient.set(null);
      this.notify.success('Lien d’essai envoyé.');
      await this.load();
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, 'Le lien d’essai n’a pas été envoyé.'));
    } finally {
      this.sending.set(false);
    }
  }

  protected async copy(url: string): Promise<void> {
    await copyLink(url, this.notify);
  }
}
