import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import type { Contact, ContactDraft } from '../../account/account.model';
import { AccountService } from '../../account/account.service';

/**
 * Cible d'édition d'un contact :
 * - `primary` — le contact principal, aplati sur l'entreprise (pas d'id) ;
 * - `additional` avec `contactId: null` — un **nouveau** contact ;
 * - `additional` avec un `contactId` — un contact existant à remplacer.
 */
export type ContactTarget =
  { readonly kind: 'primary' } | { readonly kind: 'additional'; readonly contactId: string | null };

/** Charge d'ouverture du panneau. */
export interface ContactPanelData {
  readonly companyId: string;
  readonly target: ContactTarget;
  /** Valeurs de départ (préremplissage en édition). */
  readonly initial: ContactDraft;
}

/**
 * Panneau **contact** — ajoute ou édite un interlocuteur d'une entreprise.
 *
 * Un seul panneau pour les trois cas (principal / nouveau / existant) : le
 * formulaire est identique, seule l'action de sauvegarde diffère, choisie
 * d'après la cible. Il ne se referme qu'**après** confirmation du backend, pour
 * qu'une erreur (e-mail invalide, droit refusé) reste visible dans le formulaire.
 */
@Component({
  selector: 'app-contact-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldButtonComponent,
  ],
  templateUrl: './contact-panel.html',
  styleUrl: './contact-panel.scss',
})
export class ContactPanel {
  private readonly account = inject(AccountService);
  private readonly ref = inject(FoldPanelRef);

  readonly data = input<ContactPanelData | undefined>(undefined);

  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly fonction = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');

  protected readonly error = this.account.error;
  protected readonly submitting = computed(() => this.account.status() === 'loading');

  /** Le contact principal ne se renomme pas « ajouter » : c'est toujours une édition. */
  protected readonly heading = computed(() => {
    const target = this.data()?.target;
    if (target?.kind === 'primary') {
      return 'Modifier le contact principal';
    }
    return target?.contactId ? 'Modifier le contact' : 'Ajouter un contact';
  });

  protected readonly canSubmit = computed(
    () =>
      this.firstName().trim() !== '' && this.lastName().trim() !== '' && this.email().trim() !== '',
  );

  constructor() {
    // L'input est fixé à l'ouverture ; on sème les champs une fois.
    effect(() => {
      const initial = this.data()?.initial;
      if (initial) {
        this.firstName.set(initial.firstName);
        this.lastName.set(initial.lastName);
        this.fonction.set(initial.fonction);
        this.email.set(initial.email);
        this.phone.set(initial.phone);
      }
    });
  }

  protected submit(): void {
    const data = this.data();
    if (data === undefined || !this.canSubmit() || this.submitting()) {
      return;
    }
    const draft: ContactDraft = {
      firstName: this.firstName().trim(),
      lastName: this.lastName().trim(),
      fonction: this.fonction().trim(),
      email: this.email().trim(),
      phone: this.phone().trim(),
    };
    const close = (): void => this.ref.close();

    if (data.target.kind === 'primary') {
      this.account.updatePrimaryContact(data.companyId, draft, close);
    } else if (data.target.contactId === null) {
      this.account.addContact(data.companyId, draft, close);
    } else {
      this.account.updateContact(data.companyId, data.target.contactId, draft, close);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}

/** Réduit un `Contact` (vue) à un brouillon éditable. */
export function contactToDraft(contact: Contact): ContactDraft {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    fonction: contact.fonction,
    email: contact.email,
    phone: contact.phone,
  };
}
