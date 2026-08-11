import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FoldViewNavComponent, type FoldViewNavItem } from 'fold-ng';

import { AvailabilityCard } from './availability-card/availability-card';
import { AccountAlertsCard } from './account-alerts-card/account-alerts-card';
import { ActivationAlertsCard } from './activation-alerts-card/activation-alerts-card';
import { MarketCard } from './market-card/market-card';

/** Les trois sections, dans l'ordre où le commercial les rencontre. */
type SectionKey = 'rdv' | 'marches' | 'alertes';

/**
 * Sous-page **Commercial** des Réglages (staff). Trois sections, présentées par
 * une **barre horizontale** plutôt qu'empilées en trois cartes : elles n'ont
 * rien à voir l'une avec l'autre, et les faire défiler ensemble obligeait à
 * traverser une grille hebdomadaire entière pour atteindre deux champs.
 *
 * Onglets **non routés** (`[(activeKey)]`) : ce sont des vues d'un même écran de
 * réglages, pas des destinations qu'on partage par URL. Le rail routé des
 * Réglages reste le niveau au-dessus.
 *
 * - **Prise de rendez-vous** — la grille de disponibilité, sa politique, ses
 *   exceptions, et l'aperçu de ce que le client verra.
 * - **Définition des marchés** — zones et codes NAF visés, avec leur comptage.
 * - **Alertes** — deux jeux de règles que le mot « alerte » réunissait à tort :
 *   les seuils de couleur du calendrier d'acquisition (un dossier qu'on n'a pas
 *   encore traité) et les alertes de compte client (un client qu'on a déjà).
 */
@Component({
  selector: 'app-reglages-commercial-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldViewNavComponent,
    AvailabilityCard,
    MarketCard,
    ActivationAlertsCard,
    AccountAlertsCard,
  ],
  templateUrl: './reglages-commercial-page.html',
  styleUrl: './reglages-commercial-page.scss',
})
export class ReglagesCommercialPage {
  protected readonly section = signal<string>('rdv');

  protected readonly sections: FoldViewNavItem[] = [
    { key: 'rdv' satisfies SectionKey, label: 'Prise de rendez-vous', icon: 'calendar' },
    { key: 'marches' satisfies SectionKey, label: 'Définition des marchés', icon: 'map-pin' },
    { key: 'alertes' satisfies SectionKey, label: 'Alertes', icon: 'bell' },
  ];
}
