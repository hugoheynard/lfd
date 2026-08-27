import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ClientCopyService } from '../../../client/copy/client-copy.service';

/** Le filet « ou » qui sépare la voie principale de la porte de secours. */
@Component({
  selector: 'app-rule-ou',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rule-ou.html',
  styleUrl: './rule-ou.scss',
})
export class RuleOu {
  protected readonly t = inject(ClientCopyService).t;
}
