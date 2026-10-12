import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldSurfaceDirective, FoldViewNavComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { HandoverMasthead } from '../../handover-shop/handover-masthead/handover-masthead';
import { WorkspaceCatalogue } from '../../shared/workspace-rail/workspaces';

/**
 * **La bande de tête du comptoir**, présente sur ses trois vues (Hugo,
 * 2026-10-12 : « le masthead devrait rester présent sur toutes les pages »).
 *
 * Elle porte d'abord les **onglets du comptoir** — Retrait, Réassort, Nouvelle
 * commande pro —, lus dans `COMPTOIR_VIEWS` et donc filtrés par les droits
 * comme les tuiles du lanceur. Puis, pour qui tient le retrait, la part du
 * retrait (`app-handover-masthead`) : point ouvert, compteurs, heure, journée.
 *
 * 🔴 **Sans `handover_counter:read`, la bande ne porte que les onglets.** La
 * part du retrait est la seule à injecter `HandoverQueueStore` : ne pas la
 * monter, c'est ne jamais appeler l'API du retrait — et ne pas se prendre un
 * 403 sur un poste qui ne tient que la commande pro.
 *
 * Sur le chrome, et à la taille d'une tablette : cibles de 48 px et texte de
 * corps plein, parce que le comptoir se sert au doigt.
 */
@Component({
  selector: 'app-comptoir-masthead',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldViewNavComponent,
    // 🔴 La directive, et pas seulement l'attribut : sans elle
    // `foldSurface="chrome"` est du HTML inerte qu'Angular ignore, et la
    // polarité n'est jamais basculée — invisible au typecheck comme à l'AOT.
    FoldSurfaceDirective,
    HandoverMasthead,
  ],
  templateUrl: './comptoir-masthead.html',
  styleUrl: './comptoir-masthead.scss',
})
export class ComptoirMasthead {
  private readonly permissions = inject(PermissionsStore);

  /** Les onglets permis, dans l'ordre de `COMPTOIR_VIEWS`. */
  protected readonly views = inject(WorkspaceCatalogue).views('comptoir');

  /** Monte-t-on la part du retrait — et donc la file ? */
  protected readonly holdsCounter = computed(() => this.permissions.can('handover_counter:read'));
}
