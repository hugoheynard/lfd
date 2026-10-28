import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { WorkshopDayReader } from '../workshop-day.reader';

/**
 * **Le pied de la fiche** — la règle de l'écran, et d'où vient ce qu'on lit :
 * l'heure du tirage, du retirage, de la dernière relecture, ou son échec.
 *
 * Il lit la journée que la fiche fournit ; il ne défile jamais.
 */
@Component({
  selector: 'app-worksheet-foot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './worksheet-foot.html',
  styleUrl: './worksheet-foot.scss',
})
export class WorksheetFoot {
  protected readonly day = inject(WorkshopDayReader);
}
