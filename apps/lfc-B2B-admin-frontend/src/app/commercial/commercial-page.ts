import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import {
  FoldPageLayoutComponent,
  FoldViewNavComponent,
  type FoldIconName,
  type FoldViewNavItem,
} from 'fold-ng';

/** Un onglet, plus ce que la page doit en dire — titre et intro vivent ICI. */
interface CommercialTab extends FoldViewNavItem {
  readonly link: string;
  readonly icon: FoldIconName;
  /** L'intro sous le titre : une phrase, celle que la vue portait elle-même avant. */
  readonly description: string;
}

/** La vue par défaut — `/commercial` y redirige, et c'est le repli du calcul. */
const COCKPIT: CommercialTab = {
  key: 'cockpit',
  label: 'Tableau de bord',
  link: 'cockpit',
  icon: 'grid',
  description: 'La journée, ceux qui attendent, et les coups à jouer.',
};

/**
 * Les vues du poste de travail. **Une seule table** : elle alimente à la fois la
 * barre d'onglets et l'en-tête de page, ce qui rend impossible qu'un titre et
 * son onglet divergent.
 *
 * Les icônes viennent du catalogue **fold** (86 noms). `FoldIconName` accepte
 * n'importe quelle chaîne : un nom emprunté à une autre bibliothèque compile et
 * n'affiche rien.
 */
const TABS: CommercialTab[] = [
  COCKPIT,
  {
    key: 'prospects',
    label: 'Prospects',
    link: 'prospects',
    icon: 'team',
    description:
      "Le parcours entier, d'un nom sur une liste à un compte qui commande — froid, tiède, chaud, puis l'activation du dossier.",
  },
  {
    key: 'croissance',
    label: 'Croissance',
    link: 'croissance',
    icon: 'stats',
    description:
      "De l'acquisition au chiffre d'affaires : comment le parc se construit, ce qu'il rapporte, et ce qui le fait partir.",
  },
  {
    key: 'calendrier',
    label: 'Calendrier',
    link: 'calendrier',
    icon: 'calendar',
    description: 'Les rendez-vous posés — cliquez-en un pour ouvrir son dossier.',
  },
];

/**
 * Le **poste de travail commercial** : un `fold-page-layout` dont l'en-tête suit
 * la vue affichée, une **barre horizontale en `fill`**, et le corps de la vue.
 *
 * Le rail latéral a été essayé puis abandonné : les pastilles pleines tiennent
 * parce qu'elles se posent SUR la première carte de la vue — même composition
 * que Réglages → Commercial. En rail, la nav et le contenu redevenaient deux
 * blocs séparés par du vide.
 *
 * L'en-tête appartient au **shell**, et c'est le point : chaque vue affichait son
 * propre `<h1>` sous un onglet qui portait déjà son nom, et sous un titre de page
 * « Commercial » que le menu de l'app annonçait une troisième fois. Le même mot
 * trois fois, et deux blocs d'en-tête empilés avant la première donnée.
 *
 * Désormais le titre EST le nom de la vue, l'onglet actif le confirme, et les
 * vues ne portent plus que leurs actions.
 */
@Component({
  selector: 'app-commercial-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, FoldPageLayoutComponent, FoldViewNavComponent],
  templateUrl: './commercial-page.html',
  styleUrl: './commercial-page.scss',
})
export class CommercialPage {
  private readonly router = inject(Router);

  protected readonly tabs: FoldViewNavItem[] = TABS;

  /** L'URL courante — la seule source de vérité de l'onglet actif. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** La vue affichée. Repli sur la première : `/commercial` seul y redirige. */
  protected readonly current = computed<CommercialTab>(() => {
    const url = this.url();
    return TABS.find((tab) => url.includes(`/commercial/${tab.link}`)) ?? COCKPIT;
  });
}
