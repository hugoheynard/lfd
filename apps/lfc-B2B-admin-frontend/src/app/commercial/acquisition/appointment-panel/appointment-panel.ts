import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';
import type { AppointmentTransition, AppointmentView } from '@lfd/contracts';
import { purposeShort } from '@lfd/b2b-ui/appointment';

import { NotifyService } from '../../../notify.service';
import { AvailabilityService } from '../../availability/availability.service';

/** Charge d'ouverture : le rendez-vous cliqué dans le calendrier. */
export interface AppointmentPanelData {
  readonly appointment: AppointmentView;
}

/** Une action proposée, avec ce qu'elle exige. */
interface Action {
  readonly status: AppointmentTransition;
  readonly label: string;
  /** L'action demande un motif avant d'être envoyée. */
  readonly needsReason: boolean;
}

const CHANNEL_LABEL: Record<string, string> = {
  phone: 'Téléphone',
  visio: 'Visio',
  onsite: 'Sur place',
};

/**
 * Panneau d'un **rendez-vous** : son détail (contact, canal, message, sujet) et
 * les actions du commercial — confirmer, honoré, absent, annuler.
 *
 * Les actions proposées dépendent de l'état : un rendez-vous clos n'en offre
 * aucune, et « honoré / absent » n'apparaissent qu'une fois l'heure passée —
 * c'est le domaine qui refuserait sinon, autant ne pas les montrer.
 *
 * Ferme avec `true` quand quelque chose a changé, pour que la page recharge.
 */
@Component({
  selector: 'app-appointment-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent],
  templateUrl: './appointment-panel.html',
  styleUrl: './appointment-panel.scss',
})
export class AppointmentPanel {
  static readonly foldPanel: FoldPanelDefaults = { modal: false, surface: 'solid', side: 'auto' };

  private readonly service = inject(AvailabilityService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<AppointmentPanelData | undefined>(undefined);

  protected readonly busy = signal(false);
  protected readonly reason = signal('');
  /** L'action qui attend son motif ; `null` quand aucune n'est en cours de saisie. */
  protected readonly pending = signal<Action | null>(null);

  protected readonly appointment = computed(() => this.data()?.appointment ?? null);

  /** Le motif, en version courte — le vocabulaire est partagé avec le client. */
  protected readonly purposeLabel = computed(() => {
    const rdv = this.appointment();
    return rdv === null ? '—' : purposeShort(rdv.purpose);
  });

  protected readonly channelLabel = computed(() => {
    const channel = this.appointment()?.channel ?? '';
    return CHANNEL_LABEL[channel] ?? channel;
  });

  /** Les actions offertes dans l'état courant. */
  protected readonly actions = computed<readonly Action[]>(() => {
    const appointment = this.appointment();
    if (appointment === null) {
      return [];
    }
    const actions: Action[] = [];
    if (appointment.status === 'requested') {
      actions.push({ status: 'confirmed', label: 'Confirmer', needsReason: false });
    }
    if (appointment.status === 'requested' || appointment.status === 'confirmed') {
      if (new Date(appointment.startAt) <= new Date()) {
        actions.push({ status: 'honored', label: 'Honoré', needsReason: false });
        actions.push({ status: 'no_show', label: 'Absent', needsReason: false });
      }
      actions.push({ status: 'cancelled', label: 'Annuler', needsReason: true });
    }
    return actions;
  });

  /** Lance une action, ou ouvre d'abord la saisie du motif. */
  protected start(action: Action): void {
    if (action.needsReason) {
      this.pending.set(action);
      return;
    }
    void this.apply(action, '');
  }

  protected confirmReason(): void {
    const action = this.pending();
    if (action === null || this.reason().trim() === '') {
      return;
    }
    void this.apply(action, this.reason().trim());
  }

  protected cancelReason(): void {
    this.pending.set(null);
    this.reason.set('');
  }

  protected setReason(value: string): void {
    this.reason.set(value);
  }

  protected close(): void {
    this.ref.close(false);
  }

  private async apply(action: Action, reason: string): Promise<void> {
    const appointment = this.appointment();
    if (appointment === null || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.service.transition(appointment.id, { status: action.status, reason });
      this.notify.success(`Rendez-vous : ${action.label.toLowerCase()}.`);
      this.ref.close(true);
    } catch {
      this.notify.error("L'action a échoué. Réessayez.");
    } finally {
      this.busy.set(false);
    }
  }
}
