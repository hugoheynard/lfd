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
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldAsideLayoutComponent,
  FoldPageLayoutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';
import type { AppointmentTransition, AppointmentView, CustomerSheetView } from '@lfd/contracts';
import { purposeShort } from '@lfd/b2b-ui/appointment';

import { NotifyService } from '../../../notify.service';
import { AvailabilityService } from '../../availability/availability.service';
import { CustomerSheet } from '../customer-sheet/customer-sheet';
import { CustomerSheetService } from '../customer-sheet/customer-sheet.service';
import { CustomerTimeline } from '../customer-timeline/customer-timeline';

/** Une action proposée, avec ce qu'elle exige. */
interface Action {
  readonly status: AppointmentTransition;
  readonly label: string;
  /** L'action demande un motif avant d'être envoyée. */
  readonly needsReason: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  requested: 'Demandé — à confirmer',
  confirmed: 'Confirmé',
  honored: 'Honoré',
  no_show: 'Client absent',
  cancelled: 'Annulé',
};

const CHANNEL_LABEL: Record<string, string> = {
  phone: 'Téléphone',
  visio: 'Visio',
  onsite: 'Sur place',
};

/**
 * Page **d'un rendez-vous** : la demande (motif, contact, canal, message), les
 * actions du commercial — confirmer, honoré, absent, annuler — et, quand il porte
 * sur une **société**, sa fiche commerciale complète.
 *
 * Une page et non un panneau : c'est ici qu'on **travaille** un rendez-vous, avec
 * la fiche du client sous les yeux. Un tiroir оblige à choisir entre l'agenda et
 * le dossier, et ne se partage pas — une page a une adresse, se rafraîchit, se
 * garde ouverte dans un onglet pendant l'appel.
 *
 * Elle se charge donc **par son identifiant**, pas depuis ce que le calendrier
 * lui aurait passé : un lien direct doit fonctionner.
 *
 * La demande d'abord, le client ensuite : on décroche pour un motif, pas pour un
 * dossier. Un rendez-vous sur un lead ou une personne n'a pas de fiche — il n'y a
 * pas encore de compte à décrire, et on ne montre pas une carte vide.
 */
@Component({
  selector: 'app-rendez-vous-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldAsideLayoutComponent,
    FoldPageLayoutComponent,
    FoldBackLinkComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldButtonComponent,
    CustomerSheet,
    CustomerTimeline,
  ],
  templateUrl: './rendez-vous-page.html',
  styleUrl: './rendez-vous-page.scss',
})
export class RendezVousPage {
  private readonly service = inject(AvailabilityService);
  private readonly sheets = inject(CustomerSheetService);
  private readonly notify = inject(NotifyService);

  /** Lié au segment de route (`withComponentInputBinding`). */
  readonly appointmentId = input.required<string>();

  protected readonly state = signal<'loading' | 'ready' | 'missing'>('loading');

  protected readonly busy = signal(false);
  protected readonly reason = signal('');
  /** L'action qui attend son motif ; `null` quand aucune n'est en cours de saisie. */
  protected readonly pending = signal<Action | null>(null);

  protected readonly appointment = signal<AppointmentView | null>(null);
  /**
   * La fiche du client. Chargée **ici** et non par la carte : le rail
   * d'historique s'en sert aussi, et deux composants qui appelleraient la même
   * route feraient deux requêtes pour un seul écran.
   */
  protected readonly sheet = signal<CustomerSheetView | null>(null);

  constructor() {
    effect(() => {
      void this.load(this.appointmentId());
    });
  }

  /** Charge le rendez-vous. Introuvable = un état de page, pas un toast fugace. */
  protected async load(appointmentId: string): Promise<void> {
    this.state.set('loading');
    try {
      const appointment = await this.service.byId(appointmentId);
      this.appointment.set(appointment);
      this.state.set('ready');
      await this.loadSheet(appointment);
    } catch {
      this.state.set('missing');
    }
  }

  /** Le motif, en version courte — le vocabulaire est partagé avec le client. */
  protected readonly purposeLabel = computed(() => {
    const rdv = this.appointment();
    return rdv === null ? '—' : purposeShort(rdv.purpose);
  });

  /**
   * La société du rendez-vous, ou `null`. C'est elle qui décide si la fiche
   * commerciale a lieu d'être — un lead n'a pas encore de compte.
   */
  protected readonly companyId = computed(() => {
    const rdv = this.appointment();
    return rdv !== null && rdv.subjectType === 'company' ? rdv.subjectId : null;
  });

  /** L'état, en clair — il porte l'en-tête de la carte. */
  protected readonly statusLabel = computed(
    () => STATUS_LABEL[this.appointment()?.status ?? ''] ?? '',
  );

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

  /**
   * La fiche, quand le rendez-vous porte sur une **société**. Son échec ne
   * bascule pas la page : le rendez-vous reste lisible et actionnable sans elle.
   */
  protected async loadSheet(appointment: AppointmentView | null): Promise<void> {
    if (appointment === null || appointment.subjectType !== 'company') {
      this.sheet.set(null);
      return;
    }
    try {
      this.sheet.set(await this.sheets.sheet(appointment.subjectId));
    } catch {
      this.sheet.set(null);
    }
  }

  /** L'état du compte a changé : on relit la fiche, pas le rendez-vous. */
  protected async reloadSheet(): Promise<void> {
    await this.loadSheet(this.appointment());
  }

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

  private async apply(action: Action, reason: string): Promise<void> {
    const appointment = this.appointment();
    if (appointment === null || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.service.transition(appointment.id, { status: action.status, reason });
      this.notify.success(`Rendez-vous : ${action.label.toLowerCase()}.`);
      // On relit plutôt que de patcher en mémoire : l'état affiché est alors
      // celui du serveur, actions disponibles comprises.
      this.pending.set(null);
      this.reason.set('');
      await this.load(appointment.id);
    } catch {
      this.notify.error("L'action a échoué. Réessayez.");
    } finally {
      this.busy.set(false);
    }
  }
}
