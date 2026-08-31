import { Injectable, computed, inject, type Signal } from '@angular/core';
import type { StaffPermission } from '@lfd/contracts';
import type { FoldIconName } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import type { WorkspaceRail, WorkspaceRailItem } from './workspace-rail.store';

/** Une vue d'espace de travail, et le droit qui l'ouvre s'il lui est propre. */
export interface WorkspaceView extends WorkspaceRailItem {
  readonly needs?: StaffPermission;
}

/**
 * Les vues du Commercial portent en plus ce que sa page doit DIRE : son titre
 * et son intro suivent la vue affichée. Une seule table, donc, plutôt qu'une
 * pour la navigation et une pour l'en-tête — c'est ce qui rend impossible qu'un
 * titre et son entrée de rail divergent.
 */
export interface CommercialView extends WorkspaceView {
  /**
   * Le préfixe d'URL qui désigne cette vue, quand il est plus large que le lien.
   * Il pilote l'EN-TÊTE, pas l'état actif : `routerLinkActive` compare au lien
   * et n'offre aucune dérogation, ni dans le rail ni dans le lanceur.
   */
  readonly match?: string;
  readonly description: string;
}

/** Un espace de travail : un contexte borné, et les vues qu'il contient. */
export interface Workspace {
  readonly key: string;
  readonly title: string;
  readonly icon: FoldIconName;
  readonly views: readonly WorkspaceView[];
}

/**
 * Les vues du **Commercial**. Chemins ABSOLUS : ces tables alimentent le rail
 * de la coquille ET le lanceur mobile, tous deux rendus par la racine.
 */
/** La vue par défaut du Commercial — `/commercial` y redirige, et c'est le
 *  repli quand l'URL ne désigne aucune vue. Nommée plutôt qu'indexée : un
 *  `COMMERCIAL_VIEWS[0]` se déplace en silence le jour où l'ordre change. */
export const COMMERCIAL_COCKPIT: CommercialView = {
  key: 'cockpit',
  label: 'Tableau de bord',
  link: '/commercial/cockpit',
  icon: 'dashboard',
  description: 'La journée, ceux qui attendent, et les coups à jouer.',
};

export const COMMERCIAL_VIEWS: readonly CommercialView[] = [
  COMMERCIAL_COCKPIT,
  {
    // En DEUXIÈME, juste après le tableau de bord : c'est la destination la
    // plus ouverte de l'app.
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
    // Le lien mène à la première des deux listes ; l'en-tête reste sur la vue,
    // parce que `match` couvre les deux.
    link: '/commercial/tarification/mercuriales-templates',
    match: '/commercial/tarification',
    icon: 'tag',
    description:
      "Les grilles de prix qu'on prépare une fois : un prix fixe, ou des paliers. On les repose chez autant de clients qu'on veut.",
  },
];

/**
 * Les vues du **PIM**. `needs` n'y figure que là où la vue ne se contente PAS
 * de `catalog:read`, le droit qui ouvre déjà l'espace : les deux seules sont le
 * référentiel fiscal et les règles comptables, qui partagent sa ressource.
 * Répéter `catalog:read` sur les six autres serait une condition toujours
 * vraie, donc jamais relue.
 */
export const PIM_VIEWS: readonly WorkspaceView[] = [
  { key: 'produits', label: 'Produits', link: '/pim/produits', icon: 'product' },
  { key: 'categories', label: 'Catégories', link: '/pim/categories', icon: 'category' },
  { key: 'vat', label: 'Taux de TVA', link: '/pim/tva', icon: 'tax', needs: 'tax:read' },
  // Même icône que les taux, et c'est voulu : les deux répondent à « ce
  // qu'on facture ». Ce qui les sépare tient au libellé — l'un est imposé
  // de l'extérieur, l'autre décidé par la maison.
  {
    key: 'accounting',
    label: 'Règles comptables',
    link: '/pim/regles-comptables',
    icon: 'tax',
    needs: 'tax:read',
  },
  // Les ancres de publication : ce que le catalogue ÉTAIT. Rangées après les
  // réglages et avant la publication — on pose une révision de ce qu'on a
  // décidé, puis on publie.
  { key: 'revisions', label: 'Révisions', link: '/pim/revisions', icon: 'timeline' },
  { key: 'collections', label: 'Collections', link: '/pim/collections', icon: 'collections' },
  { key: 'publication', label: 'Publication', link: '/pim/publication', icon: 'publish' },
  // L'URL reste `emplacements` : renommer un chemin casse les liens déjà
  // partagés, et le mot d'interface n'a pas à traîner l'espace d'URL avec lui.
  { key: 'locations', label: 'Points de vente', link: '/pim/emplacements', icon: 'places' },
  { key: 'contexts', label: 'Contextes de vente', link: '/pim/contextes', icon: 'places' },
  { key: 'integration', label: 'Intégrations', link: '/pim/integration', icon: 'integrations' },
];

/**
 * Les vues de l'**espace B2B** — ce que la plateforme client vend, et à quel
 * prix. Toutes deux sous `settings:read`, le droit qui ouvre déjà l'espace :
 * le répéter serait une condition toujours vraie, donc jamais relue.
 */
/**
 * Les vues du **B2B**, rangées par SECTION.
 *
 * Le contenu de plateforme y entre plutôt que d'ouvrir un espace à lui : ce
 * qu'on édite ici, ce sont les textes de la VITRINE B2B — le même contexte que
 * son catalogue et sa tarification. Un espace séparé aurait fait deux portes
 * pour une seule maison.
 *
 * Trois sections d'une vue chacune pour l'instant. Elles ne sont pas
 * décoratives : elles disent les trois natures de ce qu'on règle ici — ce qu'on
 * vend, à quel prix, et ce qu'on en dit — et chacune grandira de son côté.
 */
export const B2B_VIEWS: readonly WorkspaceView[] = [
  {
    key: 'catalogue',
    label: 'Catalogue',
    link: '/b2b/catalogue',
    icon: 'package',
    section: 'Catalogue',
  },
  {
    key: 'tarification',
    label: 'Tarification B2B',
    link: '/b2b/tarification',
    icon: 'tag',
    section: 'Tarification',
  },
  {
    key: 'app-footer',
    label: 'App footer',
    link: '/b2b/contenu/app-footer',
    icon: 'grid',
    section: 'Contenu',
  },
];

/**
 * Les vues de l'**Admin**. Chacune porte le droit qui l'ouvre : ranger deux
 * écrans sous un même titre ne leur donne pas le même mur. Montrée sans le
 * droit, l'entrée offrait une porte fermée à clé — on cliquait, la page
 * s'ouvrait, et chaque appel rendait 403.
 */
export const ADMIN_VIEWS: readonly WorkspaceView[] = [
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

/** Le catalogue, par clé. */
export const WORKSPACES = {
  commercial: { key: 'commercial', title: 'Commercial', icon: 'calendar', views: COMMERCIAL_VIEWS },
  pim: { key: 'pim', title: 'PIM', icon: 'catalog', views: PIM_VIEWS },
  b2b: { key: 'b2b', title: 'B2B', icon: 'store', views: B2B_VIEWS },
  admin: { key: 'admin', title: 'Admin', icon: 'shield', views: ADMIN_VIEWS },
} as const satisfies Record<string, Workspace>;

/** Une clé d'espace de travail — fermée, donc une faute de frappe ne compile pas. */
export type WorkspaceKey = keyof typeof WORKSPACES;

/**
 * Le catalogue des espaces, résolu contre les droits.
 *
 * Deux consommateurs, une table : le **rail secondaire** de la coquille, qui ne
 * montre que l'espace ouvert, et le **lanceur mobile**, qui les montre tous.
 * Le lanceur avait besoin des vues d'un espace où l'on n'est pas — ce que le
 * store, qui publie à l'entrée et efface à la sortie, ne peut pas donner. Les
 * recopier dans la racine en aurait fait une seconde source de vérité, et la
 * première vue ajoutée d'un seul côté aurait fait diverger les deux.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceCatalogue {
  private readonly permissions = inject(PermissionsStore);

  /** Les vues d'un espace que la route laissera ouvrir. */
  views(key: WorkspaceKey): Signal<WorkspaceRailItem[]> {
    return computed(() =>
      WORKSPACES[key].views
        .filter((view) => view.needs === undefined || this.permissions.can(view.needs))
        .map(({ needs, ...view }) => view),
    );
  }

  /** Le même espace, sous la forme que publie `provideWorkspaceRail`. */
  rail(key: WorkspaceKey): Signal<WorkspaceRail> {
    const views = this.views(key);
    const { title, icon } = WORKSPACES[key];
    return computed(() => ({ title, icon, items: views() }));
  }
}
