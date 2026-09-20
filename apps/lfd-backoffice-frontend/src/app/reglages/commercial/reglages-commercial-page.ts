import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FoldViewNavComponent, observeElementWidth, type FoldViewNavItem } from 'fold-ng';

import { AvailabilityCard } from './availability-card/availability-card';
import { AccountAlertsCard } from './account-alerts-card/account-alerts-card';
import { ActivationAlertsCard } from './activation-alerts-card/activation-alerts-card';
import { MarketCard } from './market-card/market-card';

/** Les trois sections, dans l'ordre où le commercial les rencontre. */
type SectionKey = 'rdv' | 'marches' | 'alertes';

/**
 * Largeur (px) sous laquelle la barre se replie en icônes. Mesurée sur le
 * besoin réel : « Prise de rendez-vous » et « Définition des marchés » côte à
 * côte réclament ~35rem en densité `comfortable`. Ce n'est pas le `foldAt` du
 * rail parent (896) : ces deux barres se replient pour des raisons différentes,
 * et partager un seuil aurait fait dépendre l'une du gabarit de l'autre.
 */
const COLLAPSE_AT = 560;

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

  /**
   * Largeur de CETTE page, pas du viewport : le rail des Réglages lui prend sa
   * place tant qu'il n'est pas replié, et en iframe de la suite le viewport ne
   * dit rien d'utile. `observeElementWidth` est la primitive de fold — celle que
   * `fold-nav-layout` utilise pour sa propre décision.
   */
  private readonly width = observeElementWidth();

  /**
   * Replie la barre en icônes quand les trois libellés ne tiennent plus.
   *
   * `w > 0` n'est pas une précaution mais la sémantique de la primitive : `0`
   * signifie « pas encore mesuré » (SSR, ou premier rendu). Sans ce test, la
   * page s'afficherait repliée le temps d'une frame puis se déplierait —
   * exactement le scintillement qu'on cherche à éviter.
   */
  protected readonly collapsed = computed(() => {
    const width = this.width();
    return width > 0 && width <= COLLAPSE_AT;
  });

  protected readonly sections: FoldViewNavItem[] = [
    { key: 'rdv' satisfies SectionKey, label: 'Prise de rendez-vous', icon: 'calendar' },
    { key: 'marches' satisfies SectionKey, label: 'Définition des marchés', icon: 'map-pin' },
    { key: 'alertes' satisfies SectionKey, label: 'Alertes', icon: 'bell' },
  ];
}
