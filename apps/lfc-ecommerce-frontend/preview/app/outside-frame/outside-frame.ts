import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FoldEmptyStateComponent } from 'fold-ng';

/**
 * **L'aperçu ouvert hors du back-office** — et rien d'autre (plan
 * `plan-textes-de-la-boutique.md`, §5 : « inactif hors cadre »).
 *
 * Aucun parcours ne se joue, aucune page de la boutique ne se monte : cette
 * racine est démarrée À LA PLACE de la boutique quand aucun parent autorisé
 * n'encadre la page.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldEmptyStateComponent],
  templateUrl: './outside-frame.html',
  styleUrl: './outside-frame.scss',
})
export class OutsideFrame {}
