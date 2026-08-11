import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type {
  BillingAddressView,
  CustomerLookupView,
  DeliveryAddressView,
  DeliveryContact,
  PickupAddressView,
  PlatformSettings,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
} from 'fold-ng';
import {
  CompanyActivationChecklist,
  CompanyAddressesCard,
  CompanyContactsCard,
  CompanyIdentityCard,
  CompanyIdentityFields,
  CompanyReferenceCard,
  ContactFields,
  EMPTY_COMPANY_CONTACT_DRAFT,
  EMPTY_COMPANY_IDENTITY_DRAFT,
  isCompanyContactValid,
  isCompanyIdentityValid,
  type CompanyActivationStep,
  type CompanyContactCardView,
  type CompanyContactDraft,
  type CompanyIdentityDraft,
  type CompanyIdentityView,
} from '@lfd/b2b-ui/company';

import type { AdminCompanyDetail, CompanyOpened } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../notify.service';
import { PickupAddressesService } from '../../reglages/retraits-livraisons/pickup-addresses.service';
import { PlatformSettingsService } from '../../reglages/platform-settings.service';
import { toContactCards, toIdentityView } from '../admin-company-view';
import { activationSteps, missingRequiredPieces, type ActivationStep } from './activation-steps';
import { AdminAdressePanel } from '../panels/adresse-panel/adresse-panel';
import { AdminIdentitePanel } from '../panels/identite-panel/identite-panel';
import { AdminReglementPanel } from '../panels/reglement-panel/reglement-panel';

type LoadState = 'loading' | 'ready' | 'error' | 'notfound';

/** Le temps laissé au commercial pour finir de taper avant d'interroger l'API. */
const LOOKUP_DEBOUNCE_MS = 400;

/**
 * Fiche **détail** d'un compte client (staff) — reflète l'**état d'activation**
 * et permet de le compléter à la place du client (Porte B). Elle charge la fiche
 * enrichie (`GET /admin/companies/:id`), rend les cartes partagées `@lfd/b2b-ui`
 * (identité, contacts, **adresses**), calcule les **pièces manquantes** et les
 * présente en **synthèse** (checklist) : chaque raccourci ouvre le panneau staff
 * correspondant. À la fermeture d'un panneau, la fiche se recharge.
 *
 * **Deux états, une seule page.** Sans identifiant de route, c'est un compte
 * qu'on est en train d'**ouvrir** : les mêmes sections, la même synthèse — vides.
 * Ouvrir un compte et le compléter ne sont pas deux écrans, c'est le même
 * travail à deux instants, et une page jumelle finirait par diverger de sa
 * sœur au premier champ ajouté d'un seul côté.
 *
 * L'identité y est un **formulaire** plutôt qu'une carte à panneau, seule
 * différence irréductible : un panneau modifie une société, et il n'y en a pas
 * encore. Une fois enregistrée, la page devient la fiche **sans navigation
 * visible** — le commercial reste là où il en était.
 */
@Component({
  selector: 'app-informations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldPageSectionComponent,
    CompanyReferenceCard,
    CompanyIdentityCard,
    CompanyIdentityFields,
    ContactFields,
    CompanyContactsCard,
    CompanyAddressesCard,
    CompanyActivationChecklist,
  ],
  templateUrl: './informations-page.html',
  styleUrl: './informations-page.scss',
})
export class InformationsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(AdminCompaniesService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly settingsService = inject(PlatformSettingsService);
  private readonly pickupsService = inject(PickupAddressesService);

  /**
   * L'identifiant de la société, `null` quand on est en train de l'ouvrir. Lu au
   * `snapshot` : la route ne change pas sous la page, sauf à la création — et là
   * on recharge nous-mêmes.
   */
  protected readonly companyId = signal<string | null>(this.route.snapshot.paramMap.get('id'));

  /** Mode **ouverture** : la société n'existe pas encore. */
  protected readonly draft = computed(() => this.companyId() === null);

  protected readonly state = signal<LoadState>('loading');
  protected readonly company = signal<AdminCompanyDetail | null>(null);

  /** Saisie d'ouverture — le strict nécessaire pour que la société existe. */
  protected readonly identityDraft = signal<CompanyIdentityDraft>(EMPTY_COMPANY_IDENTITY_DRAFT);
  protected readonly contactDraft = signal<CompanyContactDraft>(EMPTY_COMPANY_CONTACT_DRAFT);
  protected readonly creating = signal(false);

  protected readonly canCreate = computed(
    () =>
      isCompanyIdentityValid(this.identityDraft()) && isCompanyContactValid(this.contactDraft()),
  );

  /**
   * Le client **déjà connu** derrière l'adresse saisie, `null` sinon.
   *
   * Cherché pendant la frappe plutôt qu'au moment d'enregistrer : le commercial
   * doit apprendre qu'il a affaire à un client existant **pendant** qu'il l'a au
   * téléphone — après coup, il lui aurait déjà annoncé un nouvel espace.
   */
  protected readonly knownCustomer = signal<CustomerLookupView | null>(null);

  /** Les sociétés qu'il détient déjà, énumérées — pas comptées : on les nomme. */
  protected readonly knownCompanyNames = computed(() =>
    (this.knownCustomer()?.companies ?? []).map((company) => company.raisonSociale).join(', '),
  );
  /** Config plateforme (modes des pièces) — filtre la synthèse et le gate. */
  protected readonly settings = signal<PlatformSettings | null>(null);
  /** Le point de retrait par défaut, reflété quand la livraison est masquée. */
  protected readonly defaultPickup = signal<PickupAddressView | null>(null);

  /** La livraison est-elle masquée (service absent) ? Cache la carte livraison. */
  protected readonly deliveryHidden = computed(() => this.settings()?.delivery === 'hidden');

  protected readonly identity = computed<CompanyIdentityView | null>(() => {
    const company = this.company();
    return company === null ? null : toIdentityView(company);
  });
  protected readonly contacts = computed<CompanyContactCardView[]>(() => {
    const company = this.company();
    return company === null ? [] : toContactCards(company);
  });
  protected readonly billing = computed<BillingAddressView | null>(
    () => this.company()?.addresses.billing ?? null,
  );
  protected readonly deliveries = computed<readonly DeliveryAddressView[]>(
    () => this.company()?.addresses.deliveries ?? [],
  );

  /** Ce qu'il reste à compléter — sans société, c'est **tout** (mode ouverture). */
  private readonly steps = computed<readonly ActivationStep[]>(() =>
    activationSteps(this.company(), this.settings()),
  );

  /** Étapes projetées vers le view-model de la lib (ajout du `kind` d'UI). */
  protected readonly libSteps = computed<readonly CompanyActivationStep[]>(() =>
    this.steps().map((step) => ({ ...step, kind: step.key === 'kbis' ? 'file' : 'action' })),
  );

  /** Vrai quand il ne reste que la condition de règlement (les pièces sont là). */
  protected readonly ready = computed(
    () => !this.draft() && this.steps().every((step) => step.key === 'payment'),
  );

  /** Le compte est-il en attente d'activation ? (Le CTA n'a de sens que là.) */
  protected readonly isPending = computed(() => this.company()?.status === 'pending');

  /** Le compte peut-il être activé ? (pending + aucune pièce requise manquante.) */
  protected readonly canActivate = computed(
    () => this.isPending() && missingRequiredPieces(this.company(), this.settings()).length === 0,
  );

  constructor() {
    void this.load();

    // Reconnaissance du détenteur, pendant la frappe. Débouncée : une requête
    // par caractère saisi transformerait un champ e-mail en robinet.
    effect((onCleanup) => {
      const email = this.contactDraft().email.trim();
      if (!this.draft() || email === '') {
        this.knownCustomer.set(null);
        return;
      }
      const timer = setTimeout(() => {
        void this.lookupHolder(email);
      }, LOOKUP_DEBOUNCE_MS);
      onCleanup(() => {
        clearTimeout(timer);
      });
    });
  }

  /**
   * Cherche le détenteur, **en silence** si ça échoue : cette lecture est une
   * aide à la saisie, pas la saisie. Un toast d'erreur ici ferait passer une
   * commodité pour une panne, alors que l'enregistrement, lui, marchera.
   */
  private async lookupHolder(email: string): Promise<void> {
    try {
      this.knownCustomer.set(await this.service.findCustomerByEmail(email));
    } catch {
      this.knownCustomer.set(null);
    }
  }

  protected async load(): Promise<void> {
    const id = this.companyId();
    this.state.set('loading');
    try {
      const [company, settings, pickups] = await Promise.all([
        id === null ? Promise.resolve(undefined) : this.service.getById(id),
        this.settingsService.get(),
        this.pickupsService.list().catch(() => [] as readonly PickupAddressView[]),
      ]);
      // Un compte qu'on ouvre n'a pas d'id : l'absence est ATTENDUE, elle ne
      // vaut pas « introuvable ».
      if (company === undefined && id !== null) {
        this.state.set('notfound');
        return;
      }
      this.company.set(company ?? null);
      this.settings.set(settings);
      this.defaultPickup.set(pickups.find((p) => p.isDefault) ?? pickups[0] ?? null);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Ouvre le compte à partir du bloc d'identité, puis **reste sur la page** :
   * l'URL passe à celle de la fiche, les sections en attente s'allument, et le
   * commercial continue là où il en était. Rien à rouvrir, rien à retrouver.
   */
  protected async createAccount(): Promise<void> {
    if (!this.canCreate() || this.creating()) {
      return;
    }
    this.creating.set(true);
    const identity = this.identityDraft();
    const contact = this.contactDraft();
    try {
      const created = await this.service.create({
        identity: trimIdentity(identity),
        contact: trimContact(contact),
      });
      this.notify.success(openingMessage(created));
      // `replaceUrl` : revenir en arrière doit ramener à la liste, pas à un
      // formulaire déjà envoyé qu'un second clic dupliquerait.
      await this.router.navigate(['/comptes-clients', created.id, 'informations'], {
        replaceUrl: true,
      });
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.creating.set(false);
    }
  }

  /** Active le compte (gate serveur). Recharge + toast ; l'erreur 409 est affichée. */
  protected async activate(): Promise<void> {
    const company = this.company();
    if (company === null || !this.canActivate()) {
      return;
    }
    try {
      await this.service.activate(company.id);
      this.notify.success('Compte activé.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  /** Ouvre le panneau d'une étape ; recharge la fiche à sa fermeture. */
  protected act(key: string): void {
    const company = this.company();
    if (company === null) {
      return;
    }
    const closed = this.openFor(key, company);
    if (closed !== null) {
      void closed.then(() => this.load());
    }
  }

  private openFor(key: string, company: AdminCompanyDetail): Promise<unknown> | null {
    if (key === 'tva') {
      return this.panels.open(AdminIdentitePanel, {
        data: {
          companyId: company.id,
          enseigne: company.enseigne,
          tvaIntracom: company.tvaIntracom,
        },
        side: 'right',
      }).closed;
    }
    if (key === 'billing') {
      return this.panels.open(AdminAdressePanel, {
        data: { companyId: company.id, kind: 'facturation' },
        side: 'right',
      }).closed;
    }
    if (key === 'delivery') {
      return this.panels.open(AdminAdressePanel, {
        data: { companyId: company.id, kind: 'livraison', knownContacts: knownContactsOf(company) },
        side: 'right',
      }).closed;
    }
    if (key === 'payment') {
      return this.panels.open(AdminReglementPanel, {
        data: { companyId: company.id, current: company.paymentTerm },
        side: 'right',
      }).closed;
    }
    return null;
  }

  /** Dépôt du KBIS (étape `file`) — mutation directe puis rechargement + toast. */
  protected async onFile(payload: { readonly key: string; readonly file: File }): Promise<void> {
    const company = this.company();
    if (company === null) {
      return;
    }
    try {
      await this.service.uploadKbis(company.id, payload.file);
      this.notify.success('KBIS déposé.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  /** Retour à la liste des comptes clients. */
  protected back(): void {
    void this.router.navigate(['/comptes-clients']);
  }
}

/**
 * Ce qu'on annonce au commercial après l'ouverture — il a encore le client au
 * téléphone, et ce qu'il va lui dire dépend entièrement de ces trois faits.
 *
 * Le cas muet (`mailSent` faux) est le plus important à ne pas arrondir : le
 * compte existe, mais **personne n'a rien reçu**. Un « c'est envoyé ! » de
 * politesse ferait attendre un e-mail qui n'arrivera pas.
 */
function openingMessage(opened: CompanyOpened): string {
  if (!opened.accessOpened) {
    return "Compte ouvert, mais l'accès du client n'a pas pu être créé — à reprendre depuis sa fiche.";
  }
  const access = opened.attachedToExisting
    ? 'La société a rejoint son espace existant'
    : 'Son accès a été créé';
  return opened.mailSent
    ? `Compte ouvert. ${access}, l'e-mail est parti.`
    : `Compte ouvert. ${access}, mais l'e-mail n'est pas parti — prévenez le client.`;
}

/**
 * Rogne l'identité avant l'envoi : un espace de copier-coller ne doit pas
 * devenir une raison sociale qui ne ressort d'aucune recherche.
 */
function trimIdentity(draft: CompanyIdentityDraft): CompanyIdentityDraft {
  return {
    raisonSociale: draft.raisonSociale.trim(),
    enseigne: draft.enseigne.trim(),
    formeJuridique: draft.formeJuridique.trim(),
    siret: draft.siret.trim(),
    tvaIntracom: draft.tvaIntracom.trim(),
  };
}

/** Idem pour le contact — l'e-mail surtout, qui sert de clé humaine. */
function trimContact(draft: CompanyContactDraft): CompanyContactDraft {
  return {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    fonction: draft.fonction.trim(),
    email: draft.email.trim(),
    phone: draft.phone.trim(),
  };
}

/** Le contact principal, projeté en contact de livraison connu (préremplissage). */
function knownContactsOf(company: AdminCompanyDetail): readonly DeliveryContact[] {
  const c = company.primaryContact;
  if (c.firstName === '' && c.lastName === '') {
    return [];
  }
  return [{ prenom: c.firstName, nom: c.lastName, telephone: c.phone }];
}
