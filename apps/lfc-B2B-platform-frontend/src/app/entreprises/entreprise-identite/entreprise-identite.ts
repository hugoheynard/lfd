import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldCardComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import {
  companyRoleLabel,
  companyStatusLabel,
  formatSiret,
  type Company,
} from '../../account/account.model';

/**
 * Section **Identité légale** d'une entreprise — les données réelles, telles que
 * le backend les a enregistrées.
 *
 * En **lecture seule** pour l'instant : l'API n'expose pas encore la mise à jour
 * d'une société existante (`POST /companies` seulement). Afficher un bouton
 * « Modifier » qui n'écrirait nulle part, ou qui n'écrirait qu'en mémoire,
 * mentirait à l'utilisateur — mieux vaut une fiche honnête.
 */
@Component({
  selector: 'app-entreprise-identite',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldFieldListComponent,
    FoldFieldComponent,
    FoldBadgeComponent,
  ],
  templateUrl: './entreprise-identite.html',
  styleUrl: './entreprise-identite.scss',
})
export class EntrepriseIdentite {
  readonly company = input.required<Company>();

  protected readonly siret = computed(() => formatSiret(this.company().siret));
  protected readonly statusLabel = computed(() => companyStatusLabel(this.company().status));
  protected readonly roleLabel = computed(() => companyRoleLabel(this.company().role));

  /** Une société en attente est signalée en `warning`, une active en `success`. */
  protected readonly statusVariant = computed(() => {
    switch (this.company().status) {
      case 'active':
        return 'success' as const;
      case 'pending':
        return 'warning' as const;
      case 'suspended':
        return 'alert' as const;
    }
  });
}
