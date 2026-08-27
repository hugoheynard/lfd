import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FoldCalloutComponent, FoldCardComponent, FoldIconComponent } from 'fold-ng';

/**
 * L'après : le compte existe, et l'écran ne redemande rien. Le KBIS, la société,
 * les adresses attendront que la commande en ait besoin.
 */
@Component({
  selector: 'app-entered-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldCardComponent, FoldIconComponent],
  templateUrl: './entered-step.html',
  styleUrl: './entered-step.scss',
})
export class EnteredStep {}
