import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { FoldCalloutComponent } from 'fold-ng';

import type { Company } from '../../account/account.model';
import { AdressesSection } from '../../profil/adresses-section/adresses-section';
import { ContactSection } from '../../profil/contact-section/contact-section';
import { FacturationSection } from '../../profil/facturation-section/facturation-section';
import { EntrepriseIdentite } from '../entreprise-identite/entreprise-identite';

/**
 * Le contenu d'**une** entreprise : son identité, puis son contact, ses adresses
 * et sa facturation.
 *
 * ⚠️ Seule l'identité vient de l'API. Les trois sections suivantes sont celles de
 * l'ancienne page « Mon profil » et lisent encore `ProfilService`, en mémoire —
 * elles affichent donc les mêmes données de démonstration pour toutes les
 * entreprises. Le bandeau le dit à l'utilisateur plutôt que de le laisser croire
 * que ces données sont les siennes ; c'est la tranche suivante à câbler
 * (endpoints contact / adresses / facturation par société).
 */
@Component({
  selector: 'app-entreprise-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCalloutComponent,
    EntrepriseIdentite,
    ContactSection,
    AdressesSection,
    FacturationSection,
  ],
  templateUrl: './entreprise-detail.html',
  styleUrl: './entreprise-detail.scss',
})
export class EntrepriseDetail {
  readonly company = input.required<Company>();
}
