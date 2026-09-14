import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  ContactFields,
  EMPTY_COMPANY_CONTACT_DRAFT,
  isAdditionalContactValid,
  isCompanyContactValid,
  type CompanyContactDraft,
} from '@lfd/b2b-ui/company';
import type { CompanyView, ContactView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import type { ContactDraft } from '../../../../account/account.model';
import { AccountService } from '../../../../account/account.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { panelSide } from '../../../panel-side';
import { canManageContacts, draftOf } from '../users-section';

/** Les coordonnées comparées pour savoir si quelque chose a changé. */
const DETAIL_FIELDS = ['firstName', 'lastName', 'fonction', 'email', 'phone'] as const;

/** Charge d'ouverture : la société, la personne visée, et ce que la fiche montrait. */
export interface ContactEditPanelData {
  readonly companyId: string;
  /**
   * `null` pour le **détenteur** — aplati sur la société, sans identifiant, et
   * c'est la même distinction que fait le contrat. Sinon, le contact du carnet.
   */
  readonly contactId: string | null;
  readonly initial: ContactDraft;
}

/**
 * Le panneau **Modifier** d'un interlocuteur de `/mon-compte` — détenteur ou
 * contact du carnet, ouvert depuis sa fiche aux seuls rôles que l'API laisse
 * écrire.
 *
 * Les champs sont ceux du panneau d'origine (`lfd-contact-fields`) ; le chrome,
 * les libellés et le refus rendu sont ceux de l'app, comme `user-add-panel`.
 *
 * ## Deux écritures, choisies par la cible
 *
 * Le détenteur passe par `PATCH /companies/:id/contact`, **sans rôle** : le sien
 * est constaté, pas choisi. Un contact du carnet passe par
 * `PATCH …/contacts/:contactId`, rôle compris — le serveur l'exige.
 *
 * Le détenteur sur la fiche n'est pas l'adresse de connexion : le sous-titre le
 * dit, et renvoie à « Mes informations » (`Company.changePrimaryContact` ne
 * touche que la société, vérifié le 2026-09-14).
 */
@Component({
  selector: 'app-contact-edit-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ContactFields,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './contact-edit-panel.html',
  styleUrl: './contact-edit-panel.scss',
})
export class ContactEditPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  /**
   * Ouvre le panneau pour cette personne — et **rien** aux rôles que l'API
   * refuserait : la garde est ici aussi, pas seulement sur le bouton.
   *
   * `stack` : ouvert depuis le panneau Utilisateurs en pile, il se pose dessus
   * au lieu de le fermer, et l'on retrouve la liste en sortant.
   */
  static open(panels: FoldPanelHostService, company: CompanyView, contact: ContactView): void {
    if (!canManageContacts(company)) {
      return;
    }
    panels.open(ContactEditPanel, {
      side: panelSide(),
      stack: true,
      data: { companyId: company.id, contactId: contact.id, initial: draftOf(contact) },
    });
  }

  readonly data = input.required<ContactEditPanelData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly account = inject(AccountService);
  private readonly ref = inject(FoldPanelRef);

  protected readonly draft = signal<CompanyContactDraft>(EMPTY_COMPANY_CONTACT_DRAFT);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly isHolder = computed(() => this.data().contactId === null);

  /** Rien à envoyer tant que le brouillon dit ce que la fiche disait. */
  protected readonly changed = computed(() => {
    const draft = this.draft();
    const initial = this.data().initial;
    return (
      DETAIL_FIELDS.some((key) => draft[key].trim() !== initial[key].trim()) ||
      (!this.isHolder() && draft.role !== initial.role)
    );
  });

  /** L'adresse pour tous ; le rôle en plus pour un contact du carnet. */
  protected readonly canSave = computed(() => {
    const draft = this.draft();
    const valid = this.isHolder() ? isCompanyContactValid(draft) : isAdditionalContactValid(draft);
    return !this.saving() && this.changed() && valid;
  });

  constructor() {
    // Un effet : l'entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      const initial = this.data().initial;
      untracked(() => this.draft.set({ ...initial }));
    });
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    const { companyId, contactId } = this.data();
    const draft = this.draft();
    const details = {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      fonction: draft.fonction.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
    };
    this.saving.set(true);
    this.refusal.set(null);
    const refusal =
      contactId === null
        ? await this.account.saveHolder(companyId, details)
        : await this.account.saveContactEdit(companyId, contactId, {
            ...details,
            role: draft.role,
          });
    this.saving.set(false);
    if (refusal === null) {
      this.ref.close(true);
    } else {
      this.refusal.set(refusal);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
