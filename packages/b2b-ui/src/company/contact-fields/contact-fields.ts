import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { FoldInputComponent } from 'fold-ng';

import type { CompanyContactDraft } from '../company-form.model';

/**
 * Champs d'un **interlocuteur** — fragment de formulaire pur, réutilisable pour
 * ajouter/éditer un contact ou saisir le contact principal à la création. Un
 * `model` two-way `value` porte le brouillon ; le container garde l'en-tête, le
 * pied et la sauvegarde.
 */
@Component({
  selector: 'lfd-contact-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldInputComponent],
  templateUrl: './contact-fields.html',
  styleUrl: './contact-fields.scss',
})
export class ContactFields {
  /** Brouillon de contact (two-way). */
  readonly value = model.required<CompanyContactDraft>();

  protected setFirstName(firstName: string): void {
    this.value.update((draft) => ({ ...draft, firstName }));
  }
  protected setLastName(lastName: string): void {
    this.value.update((draft) => ({ ...draft, lastName }));
  }
  protected setFonction(fonction: string): void {
    this.value.update((draft) => ({ ...draft, fonction }));
  }
  protected setEmail(email: string): void {
    this.value.update((draft) => ({ ...draft, email }));
  }
  protected setPhone(phone: string): void {
    this.value.update((draft) => ({ ...draft, phone }));
  }
}
