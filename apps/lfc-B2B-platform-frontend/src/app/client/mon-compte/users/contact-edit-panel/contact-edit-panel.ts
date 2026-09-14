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
  FOLD_INLINE_CONFIRM_DEFAULT_LABELS,
  FOLD_INLINE_CONFIRM_LABELS,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDangerZoneComponent,
  type FoldInlineConfirmLabels,
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
import { dialogSide } from '../../../panel-side';
import { canManageContacts, draftOf } from '../users-section';

/** Les coordonnées comparées pour savoir si quelque chose a changé. */
const DETAIL_FIELDS = ['firstName', 'lastName', 'fonction', 'email', 'phone'] as const;

/** Charge d'ouverture : la société, la personne visée, ce que la fiche montrait, et le droit d'écrire. */
export interface ContactEditPanelData {
  readonly companyId: string;
  /**
   * `null` pour le **détenteur** — aplati sur la société, sans identifiant, et
   * c'est la même distinction que fait le contrat. Sinon, le contact du carnet.
   */
  readonly contactId: string | null;
  readonly initial: ContactDraft;
  /** `owner`/`admin` : ceux que l'API laisse modifier et retirer. Les autres LISENT. */
  readonly canManage: boolean;
}

/**
 * Les mots de la confirmation de la zone de danger : `fold-danger-zone` n'a pas
 * d'entrée de libellés (fold-ng 0.27.2, vérifié le 2026-09-14), et fold parle
 * anglais par défaut. Fournis au dialogue, ils atteignent la confirmation
 * qu'elle déploie, et elle seule.
 */
function removeConfirmLabels(): FoldInlineConfirmLabels {
  const copy = inject(ClientCopyService).t().account;
  return {
    ...FOLD_INLINE_CONFIRM_DEFAULT_LABELS,
    confirm: copy.contactRemoveConfirm,
    cancel: copy.cancel,
    cancelAria: copy.cancel,
    busy: copy.contactRemoveBusy,
    group: copy.contactRemoveGroup,
  };
}

/**
 * Le dialogue d'un **interlocuteur** de `/mon-compte` — détenteur ou contact du
 * carnet, ouvert d'un clic sur la personne, sans fiche intermédiaire (règle
 * « Saisir » du `CLAUDE.md` de l'app, 2026-09-14). Le nom `*-panel` est d'avant
 * cette règle.
 *
 * Les champs sont ceux du formulaire partagé (`lfd-contact-fields`) ; le chrome,
 * les libellés (`contactFields`) et le refus rendu sont ceux de l'app.
 *
 * ## Écrire, lire, supprimer — selon le rôle
 *
 * - **`owner`/`admin`** modifient ; « Enregistrer » ne s'arme qu'une fois le
 *   brouillon différent de la fiche, rôle compris.
 * - **Les autres rôles** reçoivent le MÊME dialogue en lecture seule
 *   (`readOnly` du formulaire partagé), sans Enregistrer ni zone de danger :
 *   l'API refuserait, et un bouton qui finit en refus se lit comme une panne.
 * - **Un contact du carnet** se supprime dans la zone de danger, sous le
 *   formulaire. **Le détenteur**, non : son rôle se transmet d'abord.
 *
 * ## Deux écritures, choisies par la cible
 *
 * Le détenteur passe par `PATCH /companies/:id/contact`, **sans rôle** : le sien
 * est constaté, pas choisi. Un contact du carnet passe par
 * `PATCH …/contacts/:contactId`, rôle compris — le serveur l'exige.
 */
@Component({
  selector: 'app-contact-edit-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ContactFields,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDangerZoneComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  providers: [{ provide: FOLD_INLINE_CONFIRM_LABELS, useFactory: removeConfirmLabels }],
  templateUrl: './contact-edit-panel.html',
  styleUrl: './contact-edit-panel.scss',
})
export class ContactEditPanel {
  /** `md` (490 px) : six champs au plus, prénom et nom côte à côte (échelle `FoldPanelSize`). */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  /**
   * Ouvre le dialogue sur cette personne — en saisie aux rôles qui gèrent, en
   * lecture seule aux autres.
   *
   * `stack` : ouvert depuis le panneau Utilisateurs, il se pose dessus au lieu
   * de le fermer, et l'on retrouve la liste en sortant. Depuis la carte bureau,
   * aucun panneau n'est ouvert : l'empilement n'y change rien.
   */
  static open(panels: FoldPanelHostService, company: CompanyView, contact: ContactView): void {
    panels.open(ContactEditPanel, {
      side: dialogSide(),
      stack: true,
      data: {
        companyId: company.id,
        contactId: contact.id,
        initial: draftOf(contact),
        canManage: canManageContacts(company),
      },
    });
  }

  readonly data = input.required<ContactEditPanelData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly account = inject(AccountService);
  private readonly ref = inject(FoldPanelRef);

  protected readonly draft = signal<CompanyContactDraft>(EMPTY_COMPANY_CONTACT_DRAFT);
  protected readonly saving = signal(false);
  protected readonly removing = signal(false);
  protected readonly refusal = signal<string | null>(null);
  /** Le message du dernier refus de suppression, `null` tant qu'il n'y en a pas. */
  protected readonly removeRefusal = signal<string | null>(null);

  protected readonly isHolder = computed(() => this.data().contactId === null);
  protected readonly readOnly = computed(() => !this.data().canManage);
  /** Un contact du carnet, à qui peut écrire : le détenteur ne se retire pas d'ici. */
  protected readonly canRemove = computed(() => this.data().canManage && !this.isHolder());

  /** Le titre d'une lecture : la personne elle-même, ou son adresse si elle n'a pas de nom. */
  protected readonly name = computed(() => {
    const { firstName, lastName, email } = this.data().initial;
    const full = `${firstName} ${lastName}`.trim();
    return full === '' ? email : full;
  });

  /** Rien à envoyer tant que le brouillon dit ce que la fiche disait. */
  protected readonly changed = computed(() => {
    const draft = this.draft();
    const initial = this.data().initial;
    return (
      DETAIL_FIELDS.some((key) => draft[key].trim() !== initial[key].trim()) ||
      (!this.isHolder() && draft.role !== initial.role)
    );
  });

  /** L'adresse pour tous ; le rôle en plus pour un contact du carnet ; et un changement. */
  protected readonly canSave = computed(() => {
    const draft = this.draft();
    const valid = this.isHolder() ? isCompanyContactValid(draft) : isAdditionalContactValid(draft);
    return !this.readOnly() && !this.saving() && this.changed() && valid;
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

  /**
   * Retire le contact confirmé dans la zone de danger. Au succès, le toast part
   * de `AccountService` et le dialogue se ferme — `/me` relu ne le porte plus ;
   * sur un refus, il reste ouvert et le montre.
   */
  protected async remove(): Promise<void> {
    const { companyId, contactId } = this.data();
    if (!this.canRemove() || contactId === null || this.removing()) {
      return;
    }
    this.removing.set(true);
    this.removeRefusal.set(null);
    const refusal = await this.account.deleteContact(companyId, contactId);
    this.removing.set(false);
    if (refusal === null) {
      this.ref.close(true);
    } else {
      this.removeRefusal.set(refusal);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
