import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FoldButtonComponent, FoldPanelHeaderComponent, FoldPanelRef } from 'fold-ng';
import {
  CompanyIdentityFields,
  ContactFields,
  EMPTY_COMPANY_CONTACT_DRAFT,
  EMPTY_COMPANY_IDENTITY_DRAFT,
  isCompanyContactValid,
  isCompanyIdentityValid,
  type CompanyContactDraft,
  type CompanyIdentityDraft,
} from '@lfd/b2b-ui/company';

import { NotifyService } from '../../notify.service';
import { AdminCompaniesService } from '../admin-companies.service';

/**
 * Panneau **Créer un compte client** (staff). Compose les deux fragments de
 * formulaire partagés — identité société + contact principal. Contrairement au
 * self-signup client, le staff saisit **aussi** le contact (pas de profil
 * créateur). À la réussite : toast + fiche du compte créé ; à l'échec : toast
 * d'erreur (message sûr de l'API), le panneau reste ouvert pour corriger.
 */
@Component({
  selector: 'app-creer-compte-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, CompanyIdentityFields, ContactFields],
  templateUrl: './creer-compte-panel.html',
  styleUrl: './creer-compte-panel.scss',
})
export class CreerComptePanel {
  private readonly service = inject(AdminCompaniesService);
  private readonly ref = inject(FoldPanelRef);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  protected readonly identity = signal<CompanyIdentityDraft>(EMPTY_COMPANY_IDENTITY_DRAFT);
  protected readonly contact = signal<CompanyContactDraft>(EMPTY_COMPANY_CONTACT_DRAFT);
  protected readonly submitting = signal(false);

  protected readonly canSubmit = computed(
    () => isCompanyIdentityValid(this.identity()) && isCompanyContactValid(this.contact()),
  );

  protected async submit(): Promise<void> {
    if (!this.canSubmit() || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    const identity = this.identity();
    const contact = this.contact();
    try {
      const created = await this.service.create({
        identity: {
          raisonSociale: identity.raisonSociale.trim(),
          enseigne: identity.enseigne.trim(),
          formeJuridique: identity.formeJuridique.trim(),
          siret: identity.siret.trim(),
          tvaIntracom: identity.tvaIntracom.trim(),
        },
        contact: {
          firstName: contact.firstName.trim(),
          lastName: contact.lastName.trim(),
          fonction: contact.fonction.trim(),
          email: contact.email.trim(),
          phone: contact.phone.trim(),
        },
      });
      this.ref.close();
      this.notify.success('Compte client créé.');
      await this.router.navigate(['/comptes-clients', created.id]);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.submitting.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
