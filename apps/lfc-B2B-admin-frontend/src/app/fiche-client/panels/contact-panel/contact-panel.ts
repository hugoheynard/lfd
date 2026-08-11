import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FoldButtonComponent, FoldPanelHeaderComponent, FoldPanelRef } from 'fold-ng';
import {
  ContactFields,
  EMPTY_COMPANY_CONTACT_DRAFT,
  isAdditionalContactValid,
  isCompanyContactValid,
  type CompanyContactDraft,
} from '@lfd/b2b-ui/company';

import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../../notify.service';

/**
 * Qui l'on édite : le **détenteur** (aplati sur la société) ou un interlocuteur
 * additionnel — nouveau (`contactId` nul) ou existant.
 *
 * Un discriminant plutôt que deux panneaux : les champs sont les mêmes, et deux
 * composants divergeraient au premier ajouté d'un seul côté.
 */
export type AdminContactTarget =
  { readonly kind: 'primary' } | { readonly kind: 'additional'; readonly contactId: string | null };

/** Charge d'ouverture : la société, la cible, et de quoi préremplir. */
export interface AdminContactPanelData {
  readonly companyId: string;
  readonly target: AdminContactTarget;
  readonly initial: CompanyContactDraft;
}

/**
 * Panneau **Contact** côté staff — le même geste que côté client, depuis l'autre
 * côté du comptoir (Porte B).
 *
 * Le carnet d'adresses d'une société n'a rien de réservé au client : le
 * commercial qui a un interlocuteur au téléphone doit pouvoir le noter tout de
 * suite. Ce qu'il ne fait pas ici, c'est ouvrir un **accès** — noter un numéro
 * et donner les clés de l'espace sont deux décisions, et les confondre ferait
 * d'un carnet d'adresses une liste de droits.
 */
@Component({
  selector: 'app-admin-contact-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, ContactFields],
  templateUrl: './contact-panel.html',
  styleUrl: './contact-panel.scss',
})
export class AdminContactPanel {
  private readonly service = inject(AdminCompaniesService);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  readonly data = input.required<AdminContactPanelData>();

  protected readonly draft = signal<CompanyContactDraft>(EMPTY_COMPANY_CONTACT_DRAFT);
  protected readonly submitting = signal(false);

  protected readonly title = computed(() => {
    const target = this.data().target;
    if (target.kind === 'primary') {
      return 'Détenteur du compte';
    }
    return target.contactId === null ? 'Nouveau contact' : 'Modifier le contact';
  });

  /** Le détenteur n'a pas de rôle à choisir : le sien est constaté. */
  protected readonly withRole = computed(() => this.data().target.kind === 'additional');

  /**
   * Seule l'adresse est exigée — c'est par elle qu'on joint quelqu'un, et le nom
   * est un confort qu'exiger bloquerait une saisie faite au téléphone. Un
   * contact du carnet doit en plus dire ce qu'il fait.
   */
  protected readonly canSubmit = computed(() =>
    this.withRole() ? isAdditionalContactValid(this.draft()) : isCompanyContactValid(this.draft()),
  );

  constructor() {
    // Préremplit à l'ouverture ; `data` est fixé et ne change plus.
    effect(() => {
      this.draft.set(this.data().initial);
    });
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit() || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    try {
      await this.save();
      this.notify.success('Contact enregistré.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.submitting.set(false);
    }
  }

  private async save(): Promise<void> {
    const { companyId, target } = this.data();
    const payload = trim(this.draft());
    if (target.kind === 'primary') {
      await this.service.updatePrimaryContact(companyId, payload);
      return;
    }
    if (target.contactId === null) {
      await this.service.addContact(companyId, payload);
      return;
    }
    await this.service.updateContact(companyId, target.contactId, payload);
  }

  protected cancel(): void {
    this.ref.close();
  }
}

/** Rogne avant l'envoi — l'e-mail surtout, qui sert de clé humaine. */
function trim(draft: CompanyContactDraft): CompanyContactDraft {
  return {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    fonction: draft.fonction.trim(),
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    role: draft.role,
  };
}
