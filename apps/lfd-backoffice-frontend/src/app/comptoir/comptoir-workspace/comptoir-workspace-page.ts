import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * **L'espace de travail du comptoir** — la vue, qui pose elle-même les onglets
 * (`ComptoirTabs`) : sous le sélecteur de point au retrait (Hugo, 2026-10-12).
 *
 * Plus de rail secondaire depuis le 2026-10-12 (Hugo) : le comptoir sert sur
 * une tablette, et ses vues sont des gros onglets en tête de page, à portée de
 * doigt, plutôt qu'un second rail qui mange la largeur. Les onglets sont lus
 * dans `COMPTOIR_VIEWS` — la même table que les tuiles du lanceur mobile, donc
 * filtrés par les mêmes droits, et un onglet sans droit n'apparaît pas.
 *
 * L'onglet actif suit l'URL : chaque onglet est un lien (`link`), et fold le
 * marque par `routerLinkActive`.
 *
 * ⚠️ **Elle n'est pas une page** : aucun `fold-page-layout` ici, chaque vue
 * porte le sien — deux layouts imbriqués empileraient les gouttières.
 */
@Component({
  selector: 'app-comptoir-workspace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  templateUrl: './comptoir-workspace-page.html',
  styleUrl: './comptoir-workspace-page.scss',
})
export class ComptoirWorkspacePage {}
