import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldCardComponent } from 'fold-ng';

import { AcquisitionSettingsService } from '../../commercial/settings/acquisition-settings.service';

/**
 * Sous-page **Commercial** des Réglages (staff) — les seuils d'alerte du pipeline
 * d'acquisition : à partir de combien de jours d'attente d'activation un créneau
 * passe en **ambre** (avertissement) puis en **rouge** (alerte). Écrits dans
 * `AcquisitionSettingsService` (persisté en `localStorage`), relus en direct par
 * le calendrier d'acquisition. Anciennement un side-panel, désormais une page.
 */
@Component({
  selector: 'app-reglages-commercial-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent],
  templateUrl: './reglages-commercial-page.html',
  styleUrl: './reglages-commercial-page.scss',
})
export class ReglagesCommercialPage {
  protected readonly settings = inject(AcquisitionSettingsService);
}
