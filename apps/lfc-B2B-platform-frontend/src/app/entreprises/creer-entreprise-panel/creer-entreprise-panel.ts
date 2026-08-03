import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';
import {
  CompanyIdentityFields,
  EMPTY_COMPANY_IDENTITY_DRAFT,
  isCompanyIdentityValid,
  type CompanyIdentityDraft,
} from '@lfd/b2b-ui/company';

import { AccountService } from '../../account/account.service';

/**
 * Panneau **Créer une entreprise**.
 *
 * On ne demande que l'**identité légale** (fragment partagé `@lfd/b2b-ui`) : le
 * contact principal est repris du profil du créateur côté backend, qui devient
 * de fait le gestionnaire. Redemander ici un nom et un e-mail déjà renseignés
 * dans « Réglages → Mon profil » serait de la double saisie.
 *
 * Le panneau ne se referme qu'**après** confirmation du backend : un SIRET déjà
 * pris ou une clé de contrôle fausse doit rester visible dans le formulaire.
 */
@Component({
  selector: 'app-creer-entreprise-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldCalloutComponent,
    FoldButtonComponent,
    CompanyIdentityFields,
  ],
  templateUrl: './creer-entreprise-panel.html',
  styleUrl: './creer-entreprise-panel.scss',
})
export class CreerEntreprisePanel {
  private readonly account = inject(AccountService);
  private readonly ref = inject(FoldPanelRef);

  protected readonly draft = signal<CompanyIdentityDraft>(EMPTY_COMPANY_IDENTITY_DRAFT);

  protected readonly submitting = computed(() => this.account.status() === 'loading');

  /**
   * Le contact étant repris du profil, un profil sans prénom ni nom fait échouer
   * la création côté domaine — sur un message parlant du « contact »,
   * incompréhensible ici. On le dit avant, et on bloque l'envoi.
   */
  protected readonly profileIncomplete = computed(() => {
    const profile = this.account.profile();
    return profile !== null && (profile.firstName === '' || profile.lastName === '');
  });

  protected readonly canSubmit = computed(
    () => !this.profileIncomplete() && isCompanyIdentityValid(this.draft()),
  );

  protected submit(): void {
    if (!this.canSubmit() || this.submitting()) {
      return;
    }
    const draft = this.draft();
    this.account.createCompany(
      {
        raisonSociale: draft.raisonSociale.trim(),
        enseigne: draft.enseigne.trim(),
        formeJuridique: draft.formeJuridique.trim(),
        siret: draft.siret.trim(),
        tvaIntracom: draft.tvaIntracom.trim(),
      },
      () => this.ref.close(),
    );
  }

  protected cancel(): void {
    this.ref.close();
  }
}
