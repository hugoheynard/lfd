import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInputComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { AccountService } from '../../account/account.service';

/**
 * Section **Mon profil** — l'identité de la personne connectée : prénom, nom,
 * e-mail, téléphone.
 *
 * Elle vit dans les Réglages, et non dans « Mes entreprises » : c'est *qui vous
 * êtes*, indépendamment des sociétés auxquelles vous appartenez. Le contact
 * d'une entreprise est une autre donnée, éditée dans l'onglet de celle-ci.
 *
 * Édition **en place** (lecture ↔ formulaire), comme les sections d'entreprise.
 */
@Component({
  selector: 'app-profil-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldFieldListComponent,
    FoldFieldComponent,
    FoldInputComponent,
    FoldButtonComponent,
  ],
  templateUrl: './profil-section.html',
  styleUrl: './profil-section.scss',
})
export class ProfilSection {
  private readonly account = inject(AccountService);

  protected readonly profile = this.account.profile;
  protected readonly error = this.account.error;
  protected readonly saving = computed(() => this.account.status() === 'loading');

  protected readonly editing = signal(false);

  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');

  /**
   * Prénom, nom et e-mail sont requis ; le téléphone est facultatif. Le bouton
   * reste désactivé tant que le formulaire ne peut pas aboutir, plutôt que de
   * laisser partir une requête qui reviendra en 400.
   */
  protected readonly canSave = computed(
    () =>
      this.firstName().trim() !== '' && this.lastName().trim() !== '' && this.email().trim() !== '',
  );

  protected startEdit(): void {
    const current = this.profile();
    this.firstName.set(current?.firstName ?? '');
    this.lastName.set(current?.lastName ?? '');
    this.email.set(current?.email ?? '');
    this.phone.set(current?.phone ?? '');
    this.editing.set(true);
  }

  protected cancel(): void {
    this.editing.set(false);
  }

  protected save(): void {
    if (!this.canSave()) {
      return;
    }
    this.account.saveProfile({
      firstName: this.firstName().trim(),
      lastName: this.lastName().trim(),
      email: this.email().trim(),
      phone: this.phone().trim(),
    });
    // On referme immédiatement : le service remplace l'état par le compte relu,
    // et une erreur éventuelle s'affiche dans le callout de la section.
    this.editing.set(false);
  }
}
