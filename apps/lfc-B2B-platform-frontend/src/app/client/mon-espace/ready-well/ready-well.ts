import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldIconComponent } from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';
import { ClientEspace } from '../espace.service';

/**
 * LE PUITS — « Prêt pour vous », et rien d'autre que ce qui attend une action.
 *
 * Le titre et son badge restent HORS de la zone défilante : on sait toujours
 * combien il en reste, même quand la quatrième carte est passée sous le pli de
 * la zone. Celle-ci plafonne à 250 px — trois cartes visibles — et défile DANS
 * le puits plutôt que d'allonger l'accueil. Au bureau, le plafond saute : la
 * hauteur n'y manque pas.
 */
@Component({
  selector: 'app-ready-well',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent, RouterLink],
  templateUrl: './ready-well.html',
  styleUrl: './ready-well.scss',
})
export class ReadyWell {
  protected readonly espace = inject(ClientEspace);
  protected readonly t = inject(ClientCopyService).t;
}
