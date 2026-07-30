import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldIconComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import {
  companyRoleLabel,
  companyStatusLabel,
  formatSiret,
  type Company,
} from '../../account/account.model';
import { AccountService } from '../../account/account.service';

/**
 * Section **Identité légale** d'une entreprise — les données réelles, telles que
 * le backend les a enregistrées, plus le **KBIS** (l'extrait demandé pour la
 * validation) : voir/télécharger pour tout membre, déposer/remplacer pour le
 * gestionnaire, badge « Certifié » quand l'entreprise est validée.
 *
 * L'identité légale reste en **lecture seule** : l'API n'expose pas encore sa
 * mise à jour (`POST /companies` seulement). Afficher un « Modifier » qui
 * n'écrirait nulle part mentirait — mieux vaut une fiche honnête.
 */
@Component({
  selector: 'app-entreprise-identite',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldFieldListComponent,
    FoldFieldComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldIconComponent,
  ],
  templateUrl: './entreprise-identite.html',
  styleUrl: './entreprise-identite.scss',
})
export class EntrepriseIdentite {
  private readonly account = inject(AccountService);

  readonly company = input.required<Company>();

  protected readonly siret = computed(() => formatSiret(this.company().siret));
  protected readonly statusLabel = computed(() => companyStatusLabel(this.company().status));
  protected readonly roleLabel = computed(() => companyRoleLabel(this.company().role));

  protected readonly kbis = computed(() => this.company().kbis);
  protected readonly canManageKbis = computed(() => this.company().role === 'company_admin');

  /** Vrai le temps du dépôt (le service passe en `loading`). */
  protected readonly busy = computed(() => this.account.status() === 'loading');
  /** Erreur d'une action KBIS (dépôt / téléchargement). */
  protected readonly error = signal<string | null>(null);

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

  /** Dépose le fichier choisi. `input` est réinitialisé pour permettre un re-dépôt du même nom. */
  protected onKbisSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) {
      return;
    }
    this.error.set(null);
    this.account.uploadKbis(this.company().id, file);
  }

  /** Ouvre le KBIS dans un nouvel onglet (le navigateur affiche le PDF). */
  protected view(): void {
    this.withBlob((url) => window.open(url, '_blank', 'noopener'));
  }

  /** Télécharge le KBIS sous son nom. */
  protected download(): void {
    const fileName = this.kbis()?.fileName ?? 'kbis.pdf';
    this.withBlob((url) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
    });
  }

  /**
   * Récupère le blob authentifié puis en fait quelque chose (voir / télécharger).
   * L'`objectURL` est révoqué après un délai — assez pour que l'onglet/navigateur
   * l'ait chargé, sans fuiter la référence.
   */
  private withBlob(use: (objectUrl: string) => void): void {
    this.error.set(null);
    this.account.fetchKbis(this.company().id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        use(url);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => this.error.set('Impossible de récupérer le KBIS. Réessayez.'),
    });
  }
}
