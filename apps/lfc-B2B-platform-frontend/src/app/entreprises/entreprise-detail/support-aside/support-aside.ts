import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FoldButtonComponent, FoldCardComponent, FoldIconComponent, FoldPanelHostService } from 'fold-ng';

import type { Company } from '../../../account/account.model';
import { ActivationSupportPanel } from '../../activation-support-panel/activation-support-panel';

/**
 * Carte **assistance commerciale** du rail droit de la fiche entreprise. Son
 * récit change avec le statut : tant que le compte n'est pas actif, elle pousse
 * la **prise de rendez-vous** pour terminer le paramétrage ; une fois actif, elle
 * reste une porte d'entrée discrète vers l'assistance. Le CTA ouvre le panneau de
 * rdv existant (`ActivationSupportPanel`), pré-rempli du profil connecté — on ne
 * lui passe que le `companyId`, comme la checklist d'activation.
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

  readonly company = input.required<Company>();

  /** Le compte a-t-il encore besoin d'être finalisé/activé ? (tout sauf `active`.) */
  protected readonly needsSetup = computed(() => this.company().status !== 'active');

  /** Ouvre le panneau de prise de rdv, pré-rempli (profil connecté côté panneau). */
  protected openSupport(): void {
    this.panelHost.open(ActivationSupportPanel, {
      data: { companyId: this.company().id },
      side: 'right',
    });
  }
}
