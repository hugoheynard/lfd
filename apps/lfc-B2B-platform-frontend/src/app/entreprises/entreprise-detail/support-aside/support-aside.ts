import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldIconComponent,
  FoldPanelHostService,
} from 'fold-ng';
import type { AppointmentView } from '@lfd/contracts';

import type { Company } from '../../../account/account.model';
import {
  ActivationSupportPanel,
  type SupportPanelData,
} from '../../activation-support-panel/activation-support-panel';
import { AppointmentsService } from '../../appointments.service';

/**
 * Carte **assistance commerciale** du rail droit de la fiche entreprise. Son
 * récit change avec le statut : tant que le compte n'est pas actif, elle pousse
 * la **prise de rendez-vous** pour terminer le paramétrage ; une fois actif, elle
 * reste une porte d'entrée discrète vers l'assistance. Le CTA ouvre le panneau de
 * rdv existant (`ActivationSupportPanel`), pré-rempli du profil connecté — on ne
 * lui passe que le `companyId`, comme la checklist d'activation.
 *
 * Elle liste aussi les **rendez-vous à venir** et permet de les **annuler**.
 * Sans ce chemin, chaque changement d'avis deviendrait un e-mail à traiter à la
 * main — c'est ce qui transforme un agenda en boîte de réception. Le serveur
 * refuse l'annulation passé le délai de prévenance ; on le dit alors plutôt que
 * de masquer le bouton, parce que le client doit savoir qu'il reste joignable.
 */
@Component({
  selector: 'app-support-aside',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldButtonComponent, FoldIconComponent],
  templateUrl: './support-aside.html',
  styleUrl: './support-aside.scss',
})
export class SupportAside {
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly appointments = inject(AppointmentsService);

  readonly company = input.required<Company>();

  /** Les rendez-vous à venir du demandeur (les siens et ceux de ses sociétés). */
  protected readonly upcoming = signal<readonly AppointmentView[]>([]);
  protected readonly cancelling = signal<string | null>(null);
  protected readonly cancelError = signal(false);

  constructor() {
    this.reload();
  }

  /** Le compte a-t-il encore besoin d'être finalisé/activé ? (tout sauf `active`.) */
  protected readonly needsSetup = computed(() => this.company().status !== 'active');

  /** Ouvre le panneau de prise de rdv, pré-rempli (profil connecté côté panneau). */
  protected async openSupport(): Promise<void> {
    const ref = this.panelHost.open<SupportPanelData, boolean>(ActivationSupportPanel, {
      data: { companyId: this.company().id },
      side: 'right',
    });
    if ((await ref.closed) === true) {
      this.reload();
    }
  }

  /** Annule un rendez-vous. Un refus serveur = trop tard : on le dit. */
  protected cancel(appointment: AppointmentView): void {
    this.cancelling.set(appointment.id);
    this.cancelError.set(false);
    this.appointments.cancel(appointment.id).subscribe({
      next: () => {
        this.cancelling.set(null);
        this.reload();
      },
      error: () => {
        this.cancelling.set(null);
        this.cancelError.set(true);
      },
    });
  }

  private reload(): void {
    this.appointments.mine().subscribe({
      next: (rows) => this.upcoming.set(rows),
      error: () => this.upcoming.set([]),
    });
  }
}
