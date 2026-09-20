import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CompanyReferenceCard } from '@lfd/b2b-ui/company';

import type { Company } from '../../../account/account.model';

/**
 * Encart **référence client** côté **client** — _container_ de
 * `@lfd/b2b-ui/company`. Passe la référence de l'entreprise et la formulation
 * client (« Votre référence… ») à la carte présentationnelle.
 */
@Component({
  selector: 'app-reference-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CompanyReferenceCard],
  templateUrl: './reference-card.html',
})
export class ReferenceCard {
  readonly company = input.required<Company>();
}
