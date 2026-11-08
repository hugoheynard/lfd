import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldCheckboxComponent } from 'fold-ng';

import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { marketingConsentCopy } from '../../copy/screens/marketing-consent.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { consentText } from '../consent-answer';

/** L'adresse de la politique de confidentialité, servie en page complète (`functions/confidentialite.ts`). */
export const PRIVACY_PAGE = '/confidentialite';

/**
 * **Une case de consentement marketing** : la phrase de la version courante,
 * et le lien vers la mention d'information (règle 16), ouvert à côté pour ne
 * rien perdre de ce qu'on saisit.
 *
 * Elle ne décide ni de paraître ni d'envoyer : le parent tient l'état.
 */
@Component({
  selector: 'app-marketing-consent-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCheckboxComponent],
  templateUrl: './marketing-consent-box.html',
  styleUrl: './marketing-consent-box.scss',
})
export class MarketingConsentBox {
  /** Quelle case : la société, ou les partenaires du groupe. */
  readonly box = input<'society' | 'partners'>('society');
  readonly checked = input(false);
  readonly checkedChange = output<boolean>();

  private readonly t = inject(ClientCopyService).t;
  protected readonly copy = screenCopy('marketingConsent', marketingConsentCopy);
  protected readonly privacyPage = PRIVACY_PAGE;

  protected readonly text = computed(() => consentText(this.copy(), this.box()));

  /** Le nouvel onglet se dit dans le nom du lien (RGAA 13.2). */
  protected readonly linkName = computed(() =>
    fill(this.t().nav.newTab, { name: this.copy().privacyLink }),
  );
}
