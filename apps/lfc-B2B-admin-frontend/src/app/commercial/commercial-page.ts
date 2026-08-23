import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { FoldPageLayoutComponent } from 'fold-ng';

import { provideWorkspaceRail } from '../shared/workspace-rail/workspace-rail.store';
import { WorkspaceViewsComponent } from '../shared/workspace-rail/workspace-views.component';
import {
  COMMERCIAL_COCKPIT,
  COMMERCIAL_VIEWS,
  WorkspaceCatalogue,
  type CommercialView,
} from '../shared/workspace-rail/workspaces';

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
    provideWorkspaceRail(inject(WorkspaceCatalogue).rail('commercial'));
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
  protected readonly current = computed<CommercialView>(() => {
    const url = this.url();
    return (
      COMMERCIAL_VIEWS.find((view) => url.includes(view.match ?? view.link)) ?? COMMERCIAL_COCKPIT
    );
  });
}
