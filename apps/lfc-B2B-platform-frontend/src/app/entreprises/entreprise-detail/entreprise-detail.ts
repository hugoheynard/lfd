import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FoldAsideLayoutComponent } from 'fold-ng';

import type { Company } from '../../account/account.model';
import { AdressesSection } from '../../profil/adresses-section/adresses-section';
import { FacturationSection } from '../../profil/facturation-section/facturation-section';
import { ActivationChecklist } from '../activation-checklist/activation-checklist';
import { CompanyContactsSection } from '../company-contacts-section/company-contacts-section';
import { EntrepriseIdentite } from '../entreprise-identite/entreprise-identite';
import { ReferenceCard } from '../reference-card/reference-card';
import { AcheminementSection } from '../acheminement-section/acheminement-section';
import { SupportAside } from './support-aside/support-aside';

/**
 * Le contenu d'**une** entreprise : son identité, ses contacts, ses adresses et
 * sa facturation — **tout** propre à cette entreprise et servi par l'API
 * (`/companies/:id/...`). En tête, l'encart d'activation liste ce qu'il reste à
 * compléter tant que l'entreprise est `pending`.
 */
@Component({
  selector: 'app-entreprise-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AcheminementSection,
    FoldAsideLayoutComponent,
    ReferenceCard,
    ActivationChecklist,
    EntrepriseIdentite,
    CompanyContactsSection,
    AdressesSection,
    FacturationSection,
    SupportAside,
  ],
  templateUrl: './entreprise-detail.html',
  styleUrl: './entreprise-detail.scss',
})
export class EntrepriseDetail {
  readonly company = input.required<Company>();
}
