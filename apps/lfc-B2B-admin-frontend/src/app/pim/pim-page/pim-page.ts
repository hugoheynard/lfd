import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import { PermissionsStore } from '../../auth/permissions.store';
import {
  provideWorkspaceRail,
  type WorkspaceRailItem,
} from '../../shared/workspace-rail/workspace-rail.store';
import { WorkspaceViewsComponent } from '../../shared/workspace-rail/workspace-views.component';

/**
 * Les vues du **PIM**.
 *
 * C'était un rail d'application quand le PIM en était une ; c'est le rail
 * d'ESPACE DE TRAVAIL de fold — app → workspace → vues en page — depuis qu'il
 * est un module. Le rail de l'application n'a qu'une entrée pour lui, et ses
 * vues occupent la colonne suivante.
 *
 * Le deuxième étage et pas le troisième : le PIM est un contexte borné entier,
 * son vocabulaire, ses sept vues et sa donnée. Rendu en barre d'onglets dans
 * une page, il se disait plus petit que ce qu'il est — et il empruntait à la
 * page une place qu'aucune de ses vues ne pouvait plus utiliser.
 *
 * La table ne porte plus ni titre ni intro : chaque vue est une page complète
 * qui écrit les siens, avec ses actions. Les répéter ici les affichait deux
 * fois — c'était l'ancien prix de la barre d'onglets horizontale, qui devait
 * bien annoncer où l'on venait d'arriver.
 *
 * `needs` n'y figure que là où la vue ne se contente PAS de `catalog:read`, le
 * droit qui ouvre déjà le PIM : aujourd'hui la seule est le référentiel fiscal,
 * qui a sa propre ressource. Répéter `catalog:read` sur les six autres serait
 * une condition toujours vraie, donc jamais relue.
 */
interface PimTab extends WorkspaceRailItem {
  readonly needs?: StaffPermission;
}

const TABS: readonly PimTab[] = [
  { key: 'produits', label: 'Produits', link: '/pim/produits', icon: 'product' },
  { key: 'categories', label: 'Catégories', link: '/pim/categories', icon: 'category' },
  { key: 'tva', label: 'Taux de TVA', link: '/pim/tva', icon: 'tax', needs: 'tax:read' },
  { key: 'collections', label: 'Collections', link: '/pim/collections', icon: 'collections' },
  { key: 'publication', label: 'Publication', link: '/pim/publication', icon: 'publish' },
  { key: 'emplacements', label: 'Emplacements', link: '/pim/emplacements', icon: 'places' },
  { key: 'integration', label: 'Intégrations', link: '/pim/integration', icon: 'integrations' },
];

/**
 * **Le PIM**, section du back-office.
 *
 * Il fut une application à part, ouverte en iframe dans le shell. Ce qui le
 * justifiait est tombé pièce par pièce — son backend, son audience, sa base —
 * et ce qui restait n'était plus une frontière mais de la duplication.
 *
 * La coquille ne porte plus AUCUNE navigation en large : elle publie ses vues,
 * et c'est la racine qui les rend dans le rail secondaire. Ce qui reste ici est
 * la reprise étroite, et le `router-outlet`. Rien à calculer sur l'URL — les
 * deux rendus font de vrais `<a routerLink>` et tiennent l'état actif seuls.
 */
@Component({
  selector: 'app-pim-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, WorkspaceViewsComponent],
  templateUrl: './pim-page.html',
  styleUrl: './pim-page.scss',
})
export class PimPage {
  private readonly permissions = inject(PermissionsStore);

  /** Le rail ne montre pas une vue dont la route refusera l'entrée. */
  private readonly views = computed<WorkspaceRailItem[]>(() =>
    TABS.filter((tab) => tab.needs === undefined || this.permissions.can(tab.needs)).map(
      ({ needs, ...tab }) => tab,
    ),
  );

  constructor() {
    provideWorkspaceRail(
      computed(() => ({ title: 'PIM', icon: 'catalog' as const, items: this.views() })),
    );
  }
}
