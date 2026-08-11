import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldIconComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
} from 'fold-ng';
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

/** Une section qui n'existera qu'une fois le compte ouvert — annoncée, pas cachée. */
interface NextSection {
  readonly icon: string;
  readonly title: string;
  readonly detail: string;
}

/**
 * Ce qui attend le commercial de l'autre côté de l'enregistrement.
 *
 * On l'écrit **avant** plutôt que de laisser la fiche le révéler : le commercial
 * qui a le client au téléphone doit savoir dès maintenant quelles pièces
 * réclamer, sinon il rappelle.
 */
const NEXT_SECTIONS: readonly NextSection[] = [
  {
    icon: 'user',
    title: 'Accès du client',
    detail: 'Son identité de connexion et le lien de création de mot de passe.',
  },
  {
    icon: 'map-pin',
    title: 'Adresses',
    detail: 'La facturation et les points de livraison.',
  },
  {
    icon: 'file-add',
    title: 'Extrait KBIS',
    detail: 'Le document reçu du client.',
  },
  {
    icon: 'calendar',
    title: 'Condition de règlement',
    detail: 'Ce qui a été convenu commercialement.',
  },
  {
    icon: 'banknote',
    title: 'Mandat de prélèvement SEPA',
    detail: 'Le RIB et les références du mandat.',
  },
];

/**
 * **Ouverture d'un compte client** (Porte B — le commercial provisionne).
 *
 * Une **page**, pas un panneau : le commercial l'a ouverte pendant un appel, il
 * y revient, il la garde à l'écran. Un tiroir se ferme au premier clic à côté et
 * emporte la saisie avec lui.
 *
 * Le formulaire ne demande que le **strict minimum pour que la société existe** —
 * son identité légale et son interlocuteur. Tout le reste (accès, adresses,
 * pièces, règlement, mandat) s'enregistre ensuite **section par section** sur la
 * fiche, exactement comme le client le fait de son côté : chaque bloc part seul,
 * rien n'est perdu si l'appel s'arrête, et le travail se reprend là où il s'est
 * interrompu.
 */
@Component({
  selector: 'app-nouveau-compte-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldIconComponent,
    CompanyIdentityFields,
    ContactFields,
  ],
  templateUrl: './nouveau-compte-page.html',
  styleUrl: './nouveau-compte-page.scss',
})
export class NouveauComptePage {
  private readonly service = inject(AdminCompaniesService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  protected readonly identity = signal<CompanyIdentityDraft>(EMPTY_COMPANY_IDENTITY_DRAFT);
  protected readonly contact = signal<CompanyContactDraft>(EMPTY_COMPANY_CONTACT_DRAFT);
  protected readonly submitting = signal(false);

  protected readonly nextSections = NEXT_SECTIONS;

  protected readonly canSubmit = computed(
    () => isCompanyIdentityValid(this.identity()) && isCompanyContactValid(this.contact()),
  );

  /**
   * Ouvre le compte, puis **enchaîne sur sa fiche**.
   *
   * `replaceUrl` : revenir en arrière depuis la fiche doit ramener à la liste,
   * pas à un formulaire de création dont le contenu vient d'être enregistré — le
   * re-soumettre créerait un doublon.
   */
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
      this.notify.success('Compte ouvert — complétez le dossier ci-dessous.');
      await this.router.navigate(['/comptes-clients', created.id, 'informations'], {
        replaceUrl: true,
      });
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.submitting.set(false);
    }
  }

  protected async cancel(): Promise<void> {
    await this.router.navigate(['/comptes-clients']);
  }
}
