import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { AccountService } from '../../account/account.service';

/**
 * Panneau **Créer une entreprise**.
 *
 * On ne demande que l'**identité légale** : le contact principal est repris du
 * profil du créateur côté backend, qui devient de fait le gestionnaire de la
 * société. Redemander ici un nom et un e-mail qu'on vient de renseigner dans
 * « Réglages → Mon profil » serait de la double saisie.
 *
 * Le panneau ne se referme qu'**après** confirmation du backend : un SIRET déjà
 * pris ou une clé de contrôle fausse doit rester visible dans le formulaire, pas
 * disparaître avec lui.
 */
@Component({
  selector: 'app-creer-entreprise-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldButtonComponent,
  ],
  templateUrl: './creer-entreprise-panel.html',
  styleUrl: './creer-entreprise-panel.scss',
})
export class CreerEntreprisePanel {
  private readonly account = inject(AccountService);
  private readonly ref = inject(FoldPanelRef);

  protected readonly raisonSociale = signal('');
  protected readonly enseigne = signal('');
  protected readonly formeJuridique = signal('');
  protected readonly siret = signal('');
  protected readonly tvaIntracom = signal('');

  protected readonly error = this.account.error;
  protected readonly submitting = computed(() => this.account.status() === 'loading');

  /**
   * Le contact de la société étant repris du profil, un profil sans prénom ni nom
   * fait échouer la création côté domaine — sur un message qui parlerait du
   * « contact », incompréhensible dans ce formulaire. On le dit avant, et on
   * bloque l'envoi.
   *
   * Ce n'est pas un cas théorique : les colonnes de profil sont arrivées avec un
   * défaut vide, donc **tout compte antérieur** est dans cet état.
   */
  protected readonly profileIncomplete = computed(() => {
    const profile = this.account.profile();
    return profile !== null && (profile.firstName === '' || profile.lastName === '');
  });

  /**
   * Contrôle **de forme** seulement : les champs obligatoires sont là et le SIRET
   * fait 14 chiffres. La validité réelle (clé de contrôle, unicité) appartient au
   * backend — la dupliquer ici la ferait dériver.
   */
  protected readonly canSubmit = computed(
    () =>
      !this.profileIncomplete() &&
      this.raisonSociale().trim() !== '' &&
      this.formeJuridique().trim() !== '' &&
      this.siret().replace(/\s/gu, '').length === 14,
  );

  protected submit(): void {
    if (!this.canSubmit() || this.submitting()) {
      return;
    }
    this.account.createCompany(
      {
        raisonSociale: this.raisonSociale().trim(),
        enseigne: this.enseigne().trim(),
        formeJuridique: this.formeJuridique().trim(),
        siret: this.siret().trim(),
        tvaIntracom: this.tvaIntracom().trim(),
      },
      () => this.ref.close(),
    );
  }

  protected cancel(): void {
    this.ref.close();
  }
}
