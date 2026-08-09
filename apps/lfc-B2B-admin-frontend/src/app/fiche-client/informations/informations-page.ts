import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type {
  ActivationPiece,
  BillingAddressView,
  DeliveryAddressView,
  DeliveryContact,
  PickupAddressView,
  PlatformSettings,
} from '@lfd/contracts';
import { FoldButtonComponent, FoldPanelHostService } from 'fold-ng';
import {
  CompanyActivationChecklist,
  CompanyAddressesCard,
  CompanyContactsCard,
  CompanyIdentityCard,
  CompanyReferenceCard,
  type CompanyActivationStep,
  type CompanyContactCardView,
  type CompanyIdentityView,
} from '@lfd/b2b-ui/company';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../notify.service';
import { PickupAddressesService } from '../../reglages/retraits-livraisons/pickup-addresses.service';
import { PlatformSettingsService } from '../../reglages/platform-settings.service';
import { toContactCards, toIdentityView } from '../admin-company-view';
import { AdminAdressePanel } from '../panels/adresse-panel/adresse-panel';
import { AdminIdentitePanel } from '../panels/identite-panel/identite-panel';
import { AdminReglementPanel } from '../panels/reglement-panel/reglement-panel';

type LoadState = 'loading' | 'ready' | 'error' | 'notfound';
type StepKey = 'tva' | 'kbis' | 'billing' | 'delivery' | 'payment';

/** Une étape d'activation restante, telle que la fiche la calcule. */
interface Step {
  readonly key: StepKey;
  readonly title: string;
  readonly detail: string;
  readonly cta: string;
}

/**
 * Fiche **détail** d'un compte client (staff) — reflète l'**état d'activation**
 * et permet de le compléter à la place du client (Porte B). Elle charge la fiche
 * enrichie (`GET /admin/companies/:id`), rend les cartes partagées `@lfd/b2b-ui`
 * (identité, contacts, **adresses**), calcule les **pièces manquantes** et les
 * présente en **synthèse** (checklist) : chaque raccourci ouvre le panneau staff
 * correspondant. À la fermeture d'un panneau, la fiche se recharge.
 */
@Component({
  selector: 'app-informations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    CompanyReferenceCard,
    CompanyIdentityCard,
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

  protected readonly state = signal<LoadState>('loading');
  protected readonly company = signal<AdminCompanyDetail | null>(null);
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

  /**
   * Les pièces restantes à compléter (les faites disparaissent). Une pièce
   * `hidden` (config) est retirée de la synthèse — on ne demande pas ce qui
   * n'existe pas (ex. livraison sans service).
   */
  private readonly steps = computed<readonly Step[]>(() => {
    const company = this.company();
    const settings = this.settings();
    if (company === null || settings === null) {
      return [];
    }
    const visible = (piece: ActivationPiece): boolean => settings[piece] !== 'hidden';
    const steps: Step[] = [];
    if (visible('tva') && company.vatNumberRequired && company.tvaIntracom.trim() === '') {
      steps.push({
        key: 'tva',
        title: 'Numéro de TVA',
        detail: 'La forme juridique impose un numéro de TVA intracommunautaire.',
        cta: 'Renseigner la TVA',
      });
    }
    if (visible('kbis') && company.kbis === null) {
      steps.push({
        key: 'kbis',
        title: 'Extrait KBIS',
        detail: "Déposez l'extrait KBIS reçu du client.",
        cta: 'Déposer le KBIS',
      });
    }
    if (visible('billing') && company.addresses.billing === null) {
      steps.push({
        key: 'billing',
        title: 'Adresse de facturation',
        detail: 'Renseignez l’adresse de facturation.',
        cta: 'Ajouter la facturation',
      });
    }
    if (visible('delivery') && company.addresses.deliveries.length === 0) {
      steps.push({
        key: 'delivery',
        title: 'Adresse de livraison',
        detail: 'Ajoutez au moins un point de livraison.',
        cta: 'Ajouter une livraison',
      });
    }
    steps.push({
      key: 'payment',
      title: 'Condition de règlement',
      detail: 'Fixez la condition de règlement convenue.',
      cta: 'Fixer la condition',
    });
    return steps;
  });

  /** Étapes projetées vers le view-model de la lib (ajout du `kind` d'UI). */
  protected readonly libSteps = computed<readonly CompanyActivationStep[]>(() =>
    this.steps().map((step) => ({ ...step, kind: step.key === 'kbis' ? 'file' : 'action' })),
  );

  /** Vrai quand il ne reste que la condition de règlement (les pièces sont là). */
  protected readonly ready = computed(() => this.steps().every((step) => step.key === 'payment'));

  /** Le compte est-il en attente d'activation ? (Le CTA n'a de sens que là.) */
  protected readonly isPending = computed(() => this.company()?.status === 'pending');

  /** Pièces `required` encore manquantes (applicables) — miroir du gate serveur. */
  private readonly missingRequired = computed<readonly ActivationPiece[]>(() => {
    const company = this.company();
    const settings = this.settings();
    if (company === null || settings === null) {
      return [];
    }
    const present: Record<ActivationPiece, boolean> = {
      tva: !company.vatNumberRequired || company.tvaIntracom.trim() !== '',
      kbis: company.kbis !== null,
      billing: company.addresses.billing !== null,
      delivery: company.addresses.deliveries.length > 0,
    };
    const pieces: ActivationPiece[] = ['tva', 'kbis', 'billing', 'delivery'];
    return pieces.filter((piece) => settings[piece] === 'required' && !present[piece]);
  });

  /** Le compte peut-il être activé ? (pending + aucune pièce requise manquante.) */
  protected readonly canActivate = computed(
    () => this.isPending() && this.missingRequired().length === 0,
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id === null) {
      this.state.set('notfound');
      return;
    }
    this.state.set('loading');
    try {
      const [company, settings, pickups] = await Promise.all([
        this.service.getById(id),
        this.settingsService.get(),
        this.pickupsService.list().catch(() => [] as readonly PickupAddressView[]),
      ]);
      if (company === undefined) {
        this.state.set('notfound');
        return;
      }
      this.company.set(company);
      this.settings.set(settings);
      this.defaultPickup.set(pickups.find((p) => p.isDefault) ?? pickups[0] ?? null);
      this.state.set('ready');
    } catch {
      this.state.set('error');
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

/** Le contact principal, projeté en contact de livraison connu (préremplissage). */
function knownContactsOf(company: AdminCompanyDetail): readonly DeliveryContact[] {
  const c = company.primaryContact;
  if (c.firstName === '' && c.lastName === '') {
    return [];
  }
  return [{ prenom: c.firstName, nom: c.lastName, telephone: c.phone }];
}
