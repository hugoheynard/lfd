import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  FoldButtonComponent,
  FoldIconComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import {
  ActivationSupportPanel,
  type SupportPanelData,
} from '../../entreprises/activation-support-panel/activation-support-panel';

/**
 * Panneau **Nous contacter** — deux chemins pour joindre La Folie Coffee :
 * **contact direct** (téléphone, e-mail) et **prise de rendez-vous**.
 * Ouvert via `FoldPanelHostService.open()` depuis l'icône contact de l'en-tête.
 * Bottom-sheet sur mobile (`side: 'auto'`).
 *
 * Le rendez-vous ouvre le **vrai** panneau de réservation, sur les créneaux que
 * le commercial a déclarés — et non plus un lien externe qui ne revenait jamais
 * dans le CRM. Ouvert ici **sans société** (`companyId: null`) : depuis l'en-tête
 * on ne sait pas de quelle entreprise il s'agit, et un rendez-vous n'a pas besoin
 * d'en avoir une — il portera sur la personne connectée.
 *
 * ⚠️ Coordonnées **placeholder** pour l'instant — à brancher sur les vraies infos
 * (voire un réglage plateforme).
 */
@Component({
  selector: 'app-contact-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, FoldIconComponent],
  templateUrl: './contact-panel.html',
  styleUrl: './contact-panel.scss',
})
export class ContactPanel {
  static readonly foldPanel: FoldPanelDefaults = { modal: false, surface: 'solid', side: 'auto' };

  private readonly ref = inject(FoldPanelRef);
  private readonly panelHost = inject(FoldPanelHostService);

  /** Coordonnées de contact — TODO : brancher sur les vraies infos / un réglage. */
  protected readonly phone = '+33 4 79 00 00 00';
  protected readonly phoneHref = 'tel:+33479000000';
  protected readonly email = 'contact@lafoliecoffee.fr';
  protected readonly hours = 'Du lundi au vendredi, 8h–18h';

  /** Ouvre la réservation, sans contexte d'entreprise. */
  protected book(): void {
    this.panelHost.open<SupportPanelData, boolean>(ActivationSupportPanel, {
      data: { companyId: null },
      side: 'auto',
    });
  }

  protected close(): void {
    this.ref.close();
  }
}
