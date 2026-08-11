import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { assignableRoleSchema, COMPANY_ROLE_LABELS, type AssignableRole } from '@lfd/contracts';
import { FoldInputComponent, FoldSelectComponent } from 'fold-ng';

import type { CompanyContactDraft } from '../company-form.model';

/** Les rôles proposés, dans l'ordre du contrat — `owner` en est absent. */
const ASSIGNABLE_ROLES: readonly { readonly value: AssignableRole; readonly label: string }[] =
  assignableRoleSchema.options.map((value) => ({ value, label: COMPANY_ROLE_LABELS[value] }));

/**
 * Champs d'un **interlocuteur** — fragment de formulaire pur, réutilisable pour
 * ajouter/éditer un contact ou saisir le contact principal à la création. Un
 * `model` two-way `value` porte le brouillon ; le container garde l'en-tête, le
 * pied et la sauvegarde.
 */
@Component({
  selector: 'lfd-contact-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldInputComponent, FoldSelectComponent],
  templateUrl: './contact-fields.html',
  styleUrl: './contact-fields.scss',
})
export class ContactFields {
  /** Brouillon de contact (two-way). */
  readonly value = model.required<CompanyContactDraft>();

  /**
   * Demande-t-on le **rôle** ? Vrai pour un contact du carnet, faux pour le
   * détenteur : le sien est constaté, pas choisi, et l'offrir laisserait croire
   * qu'une société peut avoir deux détenteurs — ou zéro.
   */
  readonly withRole = input(false);

  protected readonly roles = ASSIGNABLE_ROLES;

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

  /** Le `<select>` rend des chaînes ; seul un rôle attribuable est retenu. */
  protected setRole(raw: string): void {
    const parsed = assignableRoleSchema.safeParse(raw);
    this.value.update((draft) => ({ ...draft, role: parsed.success ? parsed.data : '' }));
  }
}
