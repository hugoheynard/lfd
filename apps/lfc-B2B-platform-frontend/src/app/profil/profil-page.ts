import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FoldPageLayoutComponent } from 'fold-ng';

import { AdressesSection } from './adresses-section/adresses-section';
import { ContactSection } from './contact-section/contact-section';
import { FacturationSection } from './facturation-section/facturation-section';
import { SocieteSection } from './societe-section/societe-section';

/**
 * **Mon profil** — le compte du client pro. La page n'est qu'une coquille de
 * composition : chaque section (établissement, contact, adresses, facturation)
 * est un composant autonome qui possède sa lecture et son édition. Identité et
 * contact s'éditent *en place* ; les adresses via un side-panel (CRUD) ; la
 * condition de paiement via un sélecteur en place.
 */
@Component({
  selector: 'app-profil-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    SocieteSection,
    ContactSection,
    AdressesSection,
    FacturationSection,
  ],
  templateUrl: './profil-page.html',
  styleUrl: './profil-page.scss',
})
export class ProfilPage {}
