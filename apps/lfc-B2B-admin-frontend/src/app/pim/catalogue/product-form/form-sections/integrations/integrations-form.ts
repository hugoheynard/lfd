import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { FoldElementTitleComponent, FoldFieldComponent, FoldFieldListComponent } from 'fold-ng';

import { ProductFormStore } from '../../product-form-store';

/**
 * Panneau Diffusion par canal — **deux blocs côte à côte**, plus un troisième
 * niveau d'onglets. Deux états vides derrière trois niveaux de navigation ne se
 * justifient pas, et l'ajout d'un champ Shopify ne doit pas créer une page.
 *
 * C'est aussi le domicile du **handle** : une URL de boutique en ligne est une
 * propriété du canal Shopify, pas de l'identité du produit. Le B2B ne s'en sert
 * pas — un professionnel qui commande en gros ne cherche pas le produit sur
 * Google — donc le référencement n'a rien à faire dans la carte Identité.
 */
@Component({
  selector: 'app-integrations-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldElementTitleComponent, FoldFieldComponent, FoldFieldListComponent],
  templateUrl: './integrations-form.html',
  styleUrls: ['../form-section.scss', './integrations-form.scss'],
})
export class IntegrationsForm {
  protected readonly store = inject(ProductFormStore);
}
