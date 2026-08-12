import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FoldAsideLayoutComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInlineConfirmComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageSectionComponent,
} from 'fold-ng';
import {
  CompanyActivationChecklist,
  CompanyAddressesCard,
  CompanyContactsCard,
  CompanyFulfillmentCard,
  CompanyIdentityCard,
  CompanyIdentityFields,
  CompanyReferenceCard,
  EMPTY_COMPANY_IDENTITY_DRAFT,
  type CompanyIdentityDraft,
} from '@lfd/b2b-ui/company';

import { ActivationAside } from '../activation-aside/activation-aside';
import { HolderPicker, type HolderChoice } from '../holder-picker/holder-picker';
import { PaiementSection } from '../paiement-section/paiement-section';
import { FicheClientActions } from './fiche-client.actions';
import { FicheClientFacade } from './fiche-client.facade';
import { FicheClientPanels } from './fiche-client.panels';
import { FicheClientStore } from './fiche-client.store';

/**
 * Fiche **détail** d'un compte client (staff) — reflète l'**état d'activation**
 * et permet de le compléter à la place du client (Porte B).
 *
 * **Deux états, une seule page.** Sans identifiant de route, c'est un compte
 * qu'on est en train d'**ouvrir** : les mêmes sections, la même synthèse — vides.
 * Ouvrir un compte et le compléter ne sont pas deux écrans, c'est le même
 * travail à deux instants, et une page jumelle finirait par diverger de sa sœur
 * au premier champ ajouté d'un seul côté.
 *
 * L'identité y est un **formulaire** plutôt qu'une carte à panneau, seule
 * différence irréductible : un panneau modifie une société, et il n'y en a pas
 * encore. Une fois enregistrée, la page devient la fiche **sans navigation
 * visible** — le commercial reste là où il en était.
 *
 * Le composant ne parle qu'à sa **façade** : il lit des signaux et déclenche des
 * gestes. Le chargement, les panneaux et les mutations vivent derrière elle,
 * chacun dans sa classe — les quatre sont fournis **ici** et non à la racine,
 * pour que chaque visite reparte d'une fiche vierge plutôt que de celle d'avant.
 */
@Component({
  selector: 'app-informations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [FicheClientFacade, FicheClientStore, FicheClientPanels, FicheClientActions],
  imports: [
    FoldAsideLayoutComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInlineConfirmComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageSectionComponent,
    CompanyReferenceCard,
    CompanyIdentityCard,
    CompanyIdentityFields,
    HolderPicker,
    CompanyContactsCard,
    CompanyAddressesCard,
    CompanyFulfillmentCard,
    CompanyActivationChecklist,
    ActivationAside,
    PaiementSection,
  ],
  templateUrl: './informations-page.html',
  styleUrl: './informations-page.scss',
})
export class InformationsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Tout ce que la page lit et déclenche. */
  protected readonly fiche = inject(FicheClientFacade);

  /** Saisie d'ouverture — le strict nécessaire pour que la société existe. */
  protected readonly identityDraft = signal<CompanyIdentityDraft>(EMPTY_COMPANY_IDENTITY_DRAFT);
  /** La confirmation de retrait de vérification est-elle ouverte ? */
  protected readonly confirmingRevoke = signal(false);

  /** Le détenteur retenu, à qui l'accès sera ouvert. */
  protected readonly holder = signal<HolderChoice | null>(null);

  protected readonly canCreate = computed(() =>
    this.fiche.canOpen(this.identityDraft(), this.holder()),
  );

  /**
   * « par Camille Rousseau (commercial), le 12/08/2026 » — ou rien du tout.
   *
   * Une trace incomplète vaut mieux qu'une trace inventée : quand l'annuaire ne
   * connaît pas l'agent, on n'affiche pas son identifiant technique au milieu
   * d'une phrase, on se contente de la date. Le `sub` reste en base pour qui
   * enquête.
   */
  /** Retire la vérification, puis referme la confirmation. */
  protected async revokeCertification(): Promise<void> {
    await this.fiche.revokeKbisCertification();
    this.confirmingRevoke.set(false);
  }

  protected readonly certifiedBy = computed(() => {
    const kbis = this.fiche.company()?.kbis;
    if (kbis === null || kbis === undefined || kbis.certifiedAt === null) {
      return '';
    }
    const date = new Date(kbis.certifiedAt).toLocaleDateString('fr-FR');
    const agent = kbis.certifiedBy?.name ?? '';
    if (agent === '') {
      return ` le ${date}`;
    }
    const role = kbis.certifiedBy?.role ?? '';
    return role === '' ? ` par ${agent}, le ${date}` : ` par ${agent} (${role}), le ${date}`;
  });

  constructor() {
    // Lu au `snapshot` : la route ne change pas sous la page, sauf à la
    // création — et là c'est nous qui la réglons.
    void this.fiche.start(this.route.snapshot.paramMap.get('id'));
  }

  /**
   * Ouvre le compte, puis règle l'URL sur sa fiche **sans naviguer** : la page
   * est déjà la bonne, et une navigation la remonterait en haut.
   */
  protected async createAccount(): Promise<void> {
    const holder = this.holder();
    if (!this.canCreate() || this.fiche.creating() || holder === null) {
      return;
    }
    const id = await this.fiche.openAccount(this.identityDraft(), holder);
    if (id !== null) {
      void this.router.navigate(['/comptes-clients', id, 'informations'], { replaceUrl: true });
    }
  }

  /** Dépôt du KBIS depuis la synthèse (la seule étape qui prend un fichier). */
  protected onFile(payload: { readonly key: string; readonly file: File }): void {
    void this.fiche.uploadKbis(payload.file);
  }

  protected back(): void {
    void this.router.navigate(['/comptes-clients']);
  }
}
