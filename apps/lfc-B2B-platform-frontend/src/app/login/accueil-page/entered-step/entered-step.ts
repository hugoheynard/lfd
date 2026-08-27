import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ClientCopyService } from '../../../client/copy/client-copy.service';
import { RouterLink } from '@angular/router';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldIconComponent,
} from 'fold-ng';

/**
 * L'après : le compte existe, et l'écran ne redemande rien. Le KBIS, la société,
 * les adresses attendront que la commande en ait besoin.
 */
@Component({
  selector: 'app-entered-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldIconComponent,
    RouterLink,
  ],
  templateUrl: './entered-step.html',
  styleUrl: './entered-step.scss',
})
export class EnteredStep {
  protected readonly t = inject(ClientCopyService).t;
}
