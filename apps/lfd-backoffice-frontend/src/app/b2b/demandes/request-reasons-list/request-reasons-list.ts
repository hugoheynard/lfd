import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { RequestKind, RequestReasonView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { CONTACT_AUDIENCE_LABELS } from '../../contact/contact-audience';
import {
  RequestReasonDialog,
  type RequestReasonDialogData,
  type RequestReasonDialogResult,
} from '../request-reason-dialog/request-reason-dialog';
import { REQUEST_PRIORITY_LABELS, REQUEST_PRIORITY_VARIANTS } from '../request-priority';
import { RequestReasonsService } from '../request-reasons.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Une ligne de la liste : le motif, et ce qu'on en dit sous son libellé. */
interface ReasonRow {
  readonly reason: RequestReasonView;
  readonly subtitle: string;
}

/**
 * **Les motifs d'un type de demande** — la liste d'un onglet de « Motifs des
 * demandes » (`demandes-clients.md`, §3.4). Le même composant pour
 * chaque `kind` : un type de demande de plus est un onglet de plus, pas un
 * écran de plus.
 *
 * Un clic sur un motif ouvre son dialogue ; qui n'a que la lecture reçoit le
 * même, sans Enregistrer ni archivage.
 */
@Component({
  selector: 'app-request-reasons-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './request-reasons-list.html',
  styleUrl: './request-reasons-list.scss',
})
export class RequestReasonsList {
  readonly kind = input.required<RequestKind>();

  private readonly api = inject(RequestReasonsService);
  private readonly permissions = inject(PermissionsStore);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  protected readonly canWrite = computed(() => this.permissions.can('b2b_contact:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly priorityLabels = REQUEST_PRIORITY_LABELS;
  protected readonly priorityVariants = REQUEST_PRIORITY_VARIANTS;
  private readonly reasons = signal<readonly RequestReasonView[]>([]);

  /** Dans l'ordre où la boutique les propose. */
  protected readonly rows = computed<readonly ReasonRow[]>(() =>
    [...this.reasons()]
      .sort((a, b) => a.position - b.position)
      .map((reason) => ({
        reason,
        subtitle: `${CONTACT_AUDIENCE_LABELS[reason.audience]} · ${reason.recipientEmail}`,
      })),
  );

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      this.kind();
      untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.reasons.set(await this.api.list(this.kind()));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected add(): Promise<void> {
    return this.open({
      kind: this.kind(),
      nextPosition: this.nextPosition(),
      canWrite: this.canWrite(),
    });
  }

  protected openReason(reason: RequestReasonView): Promise<void> {
    return this.open({
      kind: reason.kind,
      reason,
      nextPosition: this.nextPosition(),
      canWrite: this.canWrite(),
    });
  }

  private nextPosition(): number {
    return this.reasons().reduce((max, r) => Math.max(max, r.position + 1), 0);
  }

  private async open(data: RequestReasonDialogData): Promise<void> {
    const ref = this.panels.open<RequestReasonDialogData, RequestReasonDialogResult>(
      RequestReasonDialog,
      { data },
    );
    const result = await ref.closed;
    if (result === undefined) return;
    if (result === 'archived') {
      this.notify.success('Motif archivé.');
    } else {
      this.notify.success(data.reason === undefined ? 'Motif ajouté.' : 'Motif mis à jour.');
    }
    await this.load();
  }
}
