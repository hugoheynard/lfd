import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import type { StaffPermission } from '@lfd/contracts';
import { FoldPageLayoutComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import {
  provideWorkspaceRail,
  type WorkspaceRailItem,
} from '../../shared/workspace-rail/workspace-rail.store';
import { WorkspaceViewsComponent } from '../../shared/workspace-rail/workspace-views.component';

/** Une vue de l'Admin, et le droit qui l'ouvre. */
interface AdminView extends WorkspaceRailItem {
  readonly needs: StaffPermission;
}

/**
 * Les vues. Chacune porte le droit qui l'ouvre, et la liste se filtre dessus :
 * ranger deux écrans sous un même titre ne leur donne pas le même mur. Montrée
 * sans le droit, l'entrée offrait une porte fermée à clé — on cliquait, la page
 * s'ouvrait, et chaque appel rendait 403.
 *
 * Chemins ABSOLUS : le rail est rendu par la racine, pas par cette page.
 */
const VIEWS: readonly AdminView[] = [
  {
    key: 'acces-en-attente',
    label: 'Accès à remettre',
    link: '/admin/acces-en-attente',
    icon: 'shield',
    needs: 'companies:read',
  },
  {
    key: 'utilisateurs',
    label: 'Utilisateurs',
    link: '/admin/utilisateurs',
    icon: 'user',
    needs: 'staff:read',
  },
  {
    key: 'journal',
    label: 'Journal',
    link: '/admin/journal',
    icon: 'timeline',
    needs: 'activity:read',
  },
];

/** L'espace lui-même, quand aucune vue n'est reconnue dans l'URL. */
const ADMIN: WorkspaceRailItem = {
  key: 'admin',
  label: 'Admin',
  link: '/admin',
  icon: 'shield',
};

/**
 * **Admin** — ce qui se règle sur les GENS, par opposition aux Réglages, qui
 * portent sur le commerce (retraits, catalogue, tarification, facturation).
 *
 * Deux vues qui vivaient chacune ailleurs, et mal :
 *
 * - **Utilisateurs** était rangé sous Réglages par commodité, alors qu'il exige
 *   `staff:read` — la seule ressource que le catalogue réserve aux
 *   administrateurs. Il fallait un garde d'exception pour l'y tenir.
 * - **Accès à remettre** occupait une entrée du menu principal, à côté de
 *   destinations qu'on ouvre vingt fois par jour, pour un geste rare.
 *
 * Les deux répondent à la même question — qui entre, et avec quoi — d'où le
 * bouclier. Sa pastille remonte au menu principal, donc rien ne se perd à
 * l'avoir rangé d'un cran plus bas.
 */
@Component({
  selector: 'app-admin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, FoldPageLayoutComponent, WorkspaceViewsComponent],
  templateUrl: './admin-page.html',
})
export class AdminPage {
  private readonly permissions = inject(PermissionsStore);
  private readonly router = inject(Router);

  /** Le rail ne montre pas une vue dont la route refusera l'entrée. */
  private readonly views = computed<WorkspaceRailItem[]>(() =>
    VIEWS.filter((view) => this.permissions.can(view.needs)).map(({ needs, ...view }) => view),
  );

  /** L'URL courante — la seule source de vérité de la vue affichée. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /**
   * La vue affichée — ce que l'en-tête de page annonce. Repli sur l'espace
   * lui-même : `/admin` seul redirige vers la première vue AUTORISÉE, qui n'est
   * pas la même pour tout le monde, et un repli en dur mentirait à qui n'a pas
   * ce droit-là.
   */
  protected readonly current = computed<WorkspaceRailItem>(() => {
    const url = this.url();
    return this.views().find((view) => url.startsWith(view.link)) ?? ADMIN;
  });

  constructor() {
    provideWorkspaceRail(
      computed(() => ({ title: 'Admin', icon: 'shield' as const, items: this.views() })),
    );
  }
}
