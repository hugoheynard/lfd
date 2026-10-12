import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { HandoverQueueStore } from '../../handover-shop/handover-queue.store';
import { ComptoirMasthead } from '../comptoir-masthead/comptoir-masthead';

/**
 * **L'espace de travail du comptoir** — la bande de tête (onglets compris),
 * puis la vue ouverte.
 *
 * Plus de rail secondaire depuis le 2026-10-12 (Hugo) : le comptoir sert sur
 * une tablette, et ses vues sont des gros onglets en tête de page, à portée de
 * doigt. Ils vivent dans la bande, qui reste quand on passe d'une vue à l'autre.
 *
 * 🔴 **`HandoverQueueStore` est fourni ICI**, pas en racine ni par la vue
 * Retrait : la file du jour et le point choisi survivent au changement
 * d'onglet, et meurent avec l'espace. Le fournisseur n'instancie rien tant que
 * personne n'injecte — et seule la part retrait de la bande, montée pour
 * `handover_counter:read`, le fait.
 *
 * ⚠️ **Elle n'est pas une page** : aucun `fold-page-layout` ici, chaque vue
 * porte le sien — deux layouts imbriqués empileraient les gouttières.
 */
@Component({
  selector: 'app-comptoir-workspace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ComptoirMasthead, RouterOutlet],
  providers: [HandoverQueueStore],
  templateUrl: './comptoir-workspace-page.html',
  styleUrl: './comptoir-workspace-page.scss',
})
export class ComptoirWorkspacePage {}
