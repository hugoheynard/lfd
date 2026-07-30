import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { FoldCalloutComponent } from 'fold-ng';

import type { Company } from '../../account/account.model';
import { AdressesSection } from '../../profil/adresses-section/adresses-section';
import { FacturationSection } from '../../profil/facturation-section/facturation-section';
import { CompanyContactsSection } from '../company-contacts-section/company-contacts-section';
import { EntrepriseIdentite } from '../entreprise-identite/entreprise-identite';

/**
 * Le contenu d'**une** entreprise : son identité, ses contacts, ses adresses et
 * sa facturation.
 *
 * Identité et **contacts** viennent de l'API (réels, propres à cette entreprise).
 * ⚠️ Adresses et facturation lisent encore `ProfilService`, en mémoire — mêmes
 * données de démonstration pour toutes les entreprises. Le bandeau le dit plutôt
 * que de laisser croire le contraire ; c'est la tranche suivante à câbler.
 */
@Component({
  selector: 'app-entreprise-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCalloutComponent,
    EntrepriseIdentite,
    CompanyContactsSection,
    AdressesSection,
    FacturationSection,
  ],
  templateUrl: './entreprise-detail.html',
  styleUrl: './entreprise-detail.scss',
})
export class EntrepriseDetail {
  readonly company = input.required<Company>();
}
