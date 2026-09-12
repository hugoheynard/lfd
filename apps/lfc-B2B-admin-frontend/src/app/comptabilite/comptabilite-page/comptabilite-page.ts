import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { provideWorkspaceRail } from '../../shared/workspace-rail/workspace-rail.store';
import { WorkspaceCatalogue } from '../../shared/workspace-rail/workspaces';

/**
 * **L'espace Comptabilité** — qui encaisse, sous quelle identité, et avec quoi.
 *
 * Un espace à lui plutôt qu'un onglet des Réglages, et la raison n'est pas la
 * taille future : les Réglages sont ce qu'on paramètre une fois, alors qu'une
 * entité émettrice se complète par étapes (déclarée, puis son ICS des semaines
 * après, puis son compte), et que la facturation et les lots de prélèvement
 * viendront s'y ranger. Rangée dans les Réglages, la comptabilité se dirait plus
 * petite que ce qu'elle est — c'est exactement l'erreur que le B2B a corrigée en
 * en sortant.
 *
 * Ses vues vivent dans le CATALOGUE et non ici : le lanceur mobile en a besoin
 * alors même qu'on n'est pas dans l'espace.
 */
@Component({
  selector: 'app-comptabilite-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class ComptabilitePage {
  private readonly catalogue = inject(WorkspaceCatalogue);

  constructor() {
    provideWorkspaceRail(this.catalogue.rail('comptabilite'));
  }
}
