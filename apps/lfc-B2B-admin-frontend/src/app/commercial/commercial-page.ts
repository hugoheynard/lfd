import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { FoldPageLayoutComponent } from 'fold-ng';

import {
  provideWorkspaceRail,
  type WorkspaceRailItem,
} from '../shared/workspace-rail/workspace-rail.store';
import { WorkspaceViewsComponent } from '../shared/workspace-rail/workspace-views.component';

/** Une vue, plus ce que la page doit en dire — titre et intro vivent ICI. */
interface CommercialTab extends WorkspaceRailItem {
  /**
   * Le préfixe d'URL qui désigne cette vue, quand il est plus large que le lien.
   *
   * Il pilote l'EN-TÊTE de page (`current`), pas l'état actif du rail : une vue
   * à deux listes (Tarification) a un lien vers l'une des deux, et sans `match`
   * le titre retomberait sur le tableau de bord dès qu'on passe sur l'autre.
   * L'entrée du rail, elle, s'éteint — `routerLinkActive` compare au lien, et
   * ni le rail ni la barre étroite n'offrent de dérogation.
   *
   * Chemin ABSOLU, comme `link` : le rail est rendu par la racine, pas par
   * cette page — un chemin relatif s'y résoudrait à côté.
   */
  readonly match?: string;
  /** L'intro sous le titre : une phrase, celle que la vue portait elle-même avant. */
  readonly description: string;
}

/** La vue par défaut — `/commercial` y redirige, et c'est le repli du calcul. */
const COCKPIT: CommercialTab = {
  key: 'cockpit',
  label: 'Tableau de bord',
  link: '/commercial/cockpit',
  icon: 'dashboard',
  description: 'La journée, ceux qui attendent, et les coups à jouer.',
};

/**
 * Les vues du poste de travail. **Une seule table** : elle alimente à la fois la
 * barre d'onglets et l'en-tête de page, ce qui rend impossible qu'un titre et
 * son onglet divergent.
 *
 * Les icônes viennent du jeu **fold** ou du catalogue de l'app
 * (`shared/icons/app-icons.ts`). Depuis fold 0.11, `FoldIconName` est FERMÉ :
 * un nom inventé ne compile plus. Ce commentaire disait l'inverse — il datait
 * d'une version où une faute de frappe passait le build et laissait un trou à
 * la place du glyphe.
 */
const TABS: CommercialTab[] = [
  COCKPIT,
  {
    // En DEUXIÈME, juste après le tableau de bord : c'est la destination la
    // plus ouverte de l'app, et elle vivait dans le rail comme une section à
    // part alors qu'elle est le cœur du poste de travail commercial.
    key: 'comptes-clients',
    label: 'Comptes clients',
    link: '/commercial/comptes-clients',
    icon: 'customer-account',
    description: 'Le parc, ceux qui commandent et ceux qui dorment.',
  },
  {
    key: 'prospects',
    label: 'Prospects',
    link: '/commercial/prospects',
    icon: 'team',
    description:
      "Le parcours entier, d'un nom sur une liste à un compte qui commande — froid, tiède, chaud, puis l'activation du dossier.",
  },
  {
    key: 'calendrier',
    label: 'Calendrier',
    link: '/commercial/calendrier',
    icon: 'calendar',
    description: 'Les rendez-vous posés — cliquez-en un pour ouvrir son dossier.',
  },
  {
    key: 'tarification',
    label: 'Tarification',
    // Le lien mène à la première des deux listes ; l'onglet reste allumé sur
    // l'autre, parce que `match` couvre les deux (cf. `current`).
    link: '/commercial/tarification/mercuriales-templates',
    match: '/commercial/tarification',
    icon: 'tag',
    description:
      "Les grilles de prix qu'on prépare une fois : un prix fixe, ou des paliers. On les repose chez autant de clients qu'on veut.",
  },
];

/**
 * Le **poste de travail commercial** : un `fold-page-layout` dont l'en-tête suit
 * la vue affichée, un **rail latéral**, et le corps de la vue.
 *
 * Le rail avait été essayé puis abandonné au profit d'une barre horizontale en
 * `fill` — les pastilles pleines tenaient parce qu'elles se posaient SUR la
 * première carte de la vue. Retour au rail le 2026-08-21, pour s'aligner sur le
 * PIM : deux sections à onglets qui ne se rangeaient pas pareil obligeaient à
 * réapprendre l'écran en changeant de section, ce qui coûte plus cher que le
 * blanc entre la nav et la première carte.
 *
 * Une différence avec le PIM demeure, et elle est structurelle : là-bas le rail
 * EST la page (chaque vue porte son propre `fold-page-layout`), ici il vit
 * DEDANS — les vues du Commercial n'ont plus d'en-tête à elles.
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
  imports: [RouterOutlet, FoldPageLayoutComponent, WorkspaceViewsComponent],
  templateUrl: './commercial-page.html',
  styleUrl: './commercial-page.scss',
})
export class CommercialPage {
  private readonly router = inject(Router);

  constructor() {
    provideWorkspaceRail(signal({ title: 'Commercial', icon: 'calendar', items: TABS }));
  }

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
    return TABS.find((tab) => url.includes(tab.match ?? tab.link)) ?? COCKPIT;
  });
}
