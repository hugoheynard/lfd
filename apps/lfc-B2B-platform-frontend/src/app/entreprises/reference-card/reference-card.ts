import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { FoldCardComponent, FoldIconComponent } from 'fold-ng';

import type { Company } from '../../account/account.model';

/**
 * Encart **référence client** — en tête du dossier. La référence `C-XXXXXX` est
 * courte et sans caractères ambigus : elle se **dicte au téléphone**, pour opérer
 * avec l'équipe commerciale même en cas de panne de service (recherche par
 * référence côté admin).
 */
@Component({
  selector: 'app-reference-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldIconComponent],
  templateUrl: './reference-card.html',
  styleUrl: './reference-card.scss',
})
export class ReferenceCard {
  readonly company = input.required<Company>();
}
