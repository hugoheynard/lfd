import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  FoldButtonComponent,
  FoldIconComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

/**
 * Panneau **Nous contacter** — deux chemins pour joindre La Folie Coffee :
 * **contact direct** (téléphone, e-mail) et **prise de rendez-vous** (lien de
 * réservation). Ouvert via `FoldPanelHostService.open()` depuis l'icône contact
 * de l'en-tête. Bottom-sheet sur mobile (`side: 'auto'`).
 *
 * ⚠️ Coordonnées **placeholder** pour l'instant — à brancher sur les vraies infos
 * (voire un réglage plateforme) et sur l'URL de réservation réelle.
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

  /** Coordonnées de contact — TODO : brancher sur les vraies infos / un réglage. */
  protected readonly phone = '+33 4 79 00 00 00';
  protected readonly phoneHref = 'tel:+33479000000';
  protected readonly email = 'contact@lafoliecoffee.fr';
  protected readonly hours = 'Du lundi au vendredi, 8h–18h';

  /** Lien de prise de rendez-vous — TODO : URL de réservation réelle. */
  protected readonly bookingUrl = 'https://cal.com/lafoliecoffee';

  protected close(): void {
    this.ref.close();
  }
}
