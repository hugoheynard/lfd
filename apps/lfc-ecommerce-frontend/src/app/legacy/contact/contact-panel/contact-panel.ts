import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  FoldButtonComponent,
  FoldIconComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { ClientAudience } from '../../../client/client-audience.service';
import { ClientLocale } from '../../../client/client-locale.service';
import {
  ContactSettingsStore,
  phonesFor,
  telHref,
} from '../../../client/shop/contact-settings.store';
import { CallDialog } from '../../../client/shop/call-dialog/call-dialog';
import { ContactDialog } from '../../../client/shop/contact-dialog/contact-dialog';
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

  private readonly settings = inject(ContactSettingsStore);
  private readonly audience = inject(ClientAudience).shown;
  private readonly locale = inject(ClientLocale).current;

  /** Les numéros réglés au back-office pour ce public ; aucun → le numéro de repli. */
  protected readonly phones = computed(() =>
    phonesFor(this.settings.settings(), this.audience(), this.locale()),
  );
  protected readonly telHref = telHref;

  constructor() {
    void this.settings.hydrate();
  }

  /** TODO : brancher sur un réglage. */
  protected readonly hours = 'Du lundi au vendredi, 8h–18h';

  /** Ouvre « Nous appeler » par-dessus ce panneau, quand il y a plusieurs numéros. */
  protected call(): void {
    CallDialog.open(this.panelHost, { phones: this.phones() }, true);
  }

  /** Ouvre « Nous écrire » par-dessus ce panneau, qui reste dessous. */
  protected write(): void {
    ContactDialog.open(this.panelHost, true);
  }

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
