import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FoldPageLayoutComponent } from 'fold-ng';

import { ContactCardSettings } from '../contact-card-settings/contact-card-settings';

/**
 * **E-commerce LFC › Contact** — la carte de contact de la boutique : surtitre,
 * titre, phrase et numéros, par public et par langue.
 *
 * Elle portait aussi les objets et la messagerie : ils sont devenus les
 * « Motifs des demandes » (Réglages) et la boîte « Demandes clients »
 * (`documentation/contenu-ecommerce/demandes-clients.md`, §3.5).
 */
@Component({
  selector: 'app-contact-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ContactCardSettings, FoldPageLayoutComponent],
  templateUrl: './contact-page.html',
})
export class ContactPage {}
