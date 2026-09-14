import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  ContactFields,
  EMPTY_COMPANY_CONTACT_DRAFT,
  isAdditionalContactValid,
  type CompanyContactDraft,
} from '@lfd/b2b-ui/company';
import type { CompanyView } from '@lfd/contracts';
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

import { AccountService } from '../../../../account/account.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { dialogSide } from '../../../panel-side';

/** Charge d'ouverture : la société à qui l'on ajoute quelqu'un. */
export interface UserAddPanelData {
  readonly companyId: string;
}

/**
 * Le panneau **Ajouter un utilisateur** de `/mon-compte` — une écriture
 * réelle (`POST /companies/:id/contacts`), ouverte par les deux cartes
 * Utilisateurs aux seuls rôles que l'API laisse écrire.
 *
 * Les champs sont ceux du panneau d'origine (`lfd-contact-fields`, rôle
 * compris) ; le chrome et les libellés sont ceux de l'app (`contactFields`).
 *
 * C'est une SAISIE : elle s'ouvre en dialogue centré au bureau, en feuille du
 * bas en pile (`dialogSide()`, règle « Saisir » du `CLAUDE.md` de l'app). Le
 * nom `*-panel` est d'avant cette règle ; il reste un panneau fold, placé au
 * centre.
 *
 * ## Ce que l'ajout crée, et ce qu'il ne crée pas
 *
 * Un **contact**, pas un compte : une ligne de coordonnées qui reçoit les
 * factures, sans espace ni mot de passe. L'invitation est une décision
 * séparée, qui n'est pas construite. Le panneau le dit en une phrase avant
 * qu'on enregistre — c'est la seule chose qui empêche de croire qu'on vient
 * d'ouvrir un accès.
 */
@Component({
  selector: 'app-user-add-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ContactFields,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './user-add-panel.html',
  styleUrl: './user-add-panel.scss',
})
export class UserAddPanel {
  /** `md` (490 px) : six champs, prénom et nom côte à côte (échelle `FoldPanelSize`, fold-ng 0.27.2). */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  static open(panels: FoldPanelHostService, company: CompanyView): void {
    panels.open(UserAddPanel, { side: dialogSide(), data: { companyId: company.id } });
  }

  readonly data = input.required<UserAddPanelData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly account = inject(AccountService);
  private readonly ref = inject(FoldPanelRef);

  protected readonly draft = signal<CompanyContactDraft>(EMPTY_COMPANY_CONTACT_DRAFT);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** L'adresse et le rôle : le reste est facultatif au contrat. */
  protected readonly canSave = computed(
    () => !this.saving() && isAdditionalContactValid(this.draft()),
  );

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    const draft = this.draft();
    this.saving.set(true);
    this.refusal.set(null);
    const refusal = await this.account.saveContact(this.data().companyId, {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      fonction: draft.fonction.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
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
