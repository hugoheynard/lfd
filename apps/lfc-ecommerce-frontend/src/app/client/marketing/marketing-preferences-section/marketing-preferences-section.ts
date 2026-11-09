import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  MarketingConsentSpace,
  MarketingPreferenceState,
  MyMarketingSpaceView,
} from '@lfd/contracts/shop-values';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import {
  marketingConsentCopy,
  type MarketingConsentCopy,
} from '../../copy/screens/marketing-consent.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { MarketingConsentBox } from '../marketing-consent-box/marketing-consent-box';
import { MarketingPreferences } from '../marketing-preferences.service';

/** Le geste qu'offre un état : s'inscrire, se désinscrire, ou se réinscrire. */
type SpaceAction = 'subscribe' | 'unsubscribe' | 'resubscribe';

/** Une carte, prête à peindre. */
interface SpaceCard {
  readonly space: MarketingConsentSpace;
  readonly name: string;
  readonly state: string;
  readonly action: SpaceAction;
  readonly actionLabel: string;
}

const ACTION_OF: Record<MarketingPreferenceState, SpaceAction> = {
  subscribed: 'unsubscribe',
  // En attente : on peut renoncer avant d'avoir cliqué le lien de confirmation.
  pending: 'unsubscribe',
  not_subscribed: 'subscribe',
  unsubscribed: 'resubscribe',
};

const STATE_KEY: Record<MarketingPreferenceState, keyof MarketingConsentCopy> = {
  subscribed: 'stateSubscribed',
  pending: 'statePending',
  not_subscribed: 'stateNotSubscribed',
  unsubscribed: 'stateUnsubscribed',
};

const SPACE_NAME_KEY: Record<MarketingConsentSpace, keyof MarketingConsentCopy> = {
  lfc: 'spaceLfc',
};

/**
 * **« Mes e-mails »** — les préférences marketing de la personne connectée,
 * une carte par société qui lui écrit (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, lot C3).
 *
 * L'état se dit en toutes lettres, et le seul bouton est le geste qui
 * convient. C'est le SEUL endroit qui réinscrit une adresse désinscrite.
 * La case « partenaires » ne paraît que si l'API la propose (règle 19).
 */
@Component({
  selector: 'app-marketing-preferences-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    MarketingConsentBox,
  ],
  templateUrl: './marketing-preferences-section.html',
  styleUrl: './marketing-preferences-section.scss',
})
export class MarketingPreferencesSection {
  protected readonly preferences = inject(MarketingPreferences);
  protected readonly copy = screenCopy('marketingConsent', marketingConsentCopy);

  /** Un geste en vol : les boutons attendent. */
  protected readonly busy = signal(false);
  /** Le dernier geste a été refusé : dit en ligne, la carte reste. */
  protected readonly writeFailed = signal(false);
  protected readonly partnersChecked = signal(false);

  protected readonly cards = computed<readonly SpaceCard[]>(() => {
    const copy = this.copy();
    return (this.preferences.view()?.spaces ?? []).map((entry: MyMarketingSpaceView) => {
      const action = ACTION_OF[entry.state];
      return {
        space: entry.space,
        name: copy[SPACE_NAME_KEY[entry.space]],
        state: copy[STATE_KEY[entry.state]],
        action,
        actionLabel: copy[action],
      };
    });
  });

  protected readonly partnersOffered = computed(
    () => this.preferences.view()?.partnersOffered === true,
  );

  constructor() {
    this.preferences.load();
  }

  protected retry(): void {
    this.preferences.load();
  }

  protected act(card: SpaceCard): Promise<void> {
    return this.run(() =>
      card.action === 'unsubscribe'
        ? this.preferences.unsubscribe(card.space)
        : this.preferences.subscribe(card.space),
    );
  }

  protected acceptPartners(): Promise<void> {
    return this.run(() => this.preferences.acceptPartners());
  }

  private async run(gesture: () => Promise<boolean>): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.writeFailed.set(false);
    const done = await gesture();
    this.busy.set(false);
    this.writeFailed.set(!done);
  }
}
