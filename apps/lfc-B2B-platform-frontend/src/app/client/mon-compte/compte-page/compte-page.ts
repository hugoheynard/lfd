import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ClientChrome } from '../../client-chrome.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { MOCK_ACCOUNT, MOCK_DELIVERIES } from '../../mock-account';
import { AccountCard } from '../account-card/account-card';
import { DataCard } from '../data-card/data-card';
import { KbisCard } from '../kbis-card/kbis-card';
import { UsersCard } from '../users-card/users-card';

/** Les sept sujets, numérotés dans l'ordre de lecture. */
const SECTIONS = [
  'identity',
  'users',
  'kbis',
  'addresses',
  'payment',
  'preferences',
  'data',
] as const;

/**
 * `/mon-compte` — le dossier client, écrit pour celui qui le possède.
 *
 * **Sept cartes, pas sept écrans.** Le back-office a une fiche à onglets parce
 * qu'un commercial y passe la journée ; un client y passe deux fois par an. Une
 * seule page qui descend, chaque carte autonome, aucun sous-écran à retrouver —
 * et le sommaire de bureau fait DÉFILER, il ne change pas d'écran. C'est écrit
 * sous la liste, et c'est vrai : chaque entrée pointe l'ancre de sa carte.
 *
 * Ce qui passe par nous le DIT. L'enseigne se change en autonomie ; raison
 * sociale, forme juridique, SIRET et TVA sont en lecture, avec la phrase qui
 * explique pourquoi — ce sont les mentions qui figurent sur les factures. Aucune
 * illusion de champ modifiable, et aucun champ grisé non plus : un champ mort se
 * lit comme une panne, une phrase se lit comme une règle.
 */
@Component({
  selector: 'app-compte-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AccountCard,
    ClientBannerBlock,
    ClientBannerOutlet,
    DataCard,
    FoldIconComponent,
    KbisCard,
    UsersCard,
  ],
  templateUrl: './compte-page.html',
  styleUrl: './compte-page.scss',
})
export class ComptePage {
  protected readonly t = inject(ClientCopyService).t;
  private readonly chrome = inject(ClientChrome);

  protected readonly account = MOCK_ACCOUNT;
  protected readonly deliveries = MOCK_DELIVERIES;

  protected readonly deliveryCount = computed(() =>
    this.t().account.deliveryCount.replace('{n}', String(MOCK_DELIVERIES.length)),
  );

  /** Le sommaire — numéroté, chaque entrée pointant l'ancre de sa carte. */
  protected readonly summary = computed(() => {
    const labels = this.t().account.sections;
    return SECTIONS.map((key, index) => ({
      key,
      label: labels[key],
      number: String(index + 1).padStart(2, '0'),
      anchor: `compte-${key}`,
    }));
  });

  constructor() {
    effect(() => this.chrome.kicker.set(this.t().nav.destinations.account));
    this.chrome.back.set(null);
    this.chrome.menu.set(true);
    this.chrome.bell.set(null);
    this.chrome.barOnDesktop.set(true);
  }
}
