import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  BillingAddressView,
  CompanyStatus,
  DeliveryAddressView,
  PickupAddressView,
  PieceMode,
  PlatformSettings,
} from '@lfd/contracts';
import type {
  CompanyActivationStep,
  CompanyContactCardView,
  CompanyIdentityView,
} from '@lfd/b2b-ui/company';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { PickupAddressesService } from '../../reglages/retraits-livraisons/pickup-addresses.service';
import { PlatformSettingsService } from '../../reglages/platform-settings.service';
import { toContactCards, toIdentityView } from '../admin-company-view';
import {
  activationSteps,
  hasLegalIdentity,
  isReachable,
  missingRequiredPieces,
  type ActivationStep,
} from './activation-steps';

/** Où en est la lecture de la fiche. */
export type LoadState = 'loading' | 'ready' | 'error' | 'notfound';

/**
 * Ce que la fiche client **lit** : la société, la configuration de la
 * plateforme, les points de retrait — et tout ce qui s'en déduit.
 *
 * Séparé des gestes ({@link FicheClientActions}) parce que ce sont deux raisons
 * de changer distinctes : ici on répond à « qu'y a-t-il à l'écran ? », là à
 * « que se passe-t-il quand on clique ? ». C'est le même partage que
 * commandes/requêtes côté serveur, et il rend chaque moitié lisible seule.
 *
 * **Portée composant, pas racine** : il porte la société *courante*. Fourni à la
 * racine, il garderait la précédente d'une visite à l'autre — la fiche montrerait
 * un instant le client d'avant.
 */
@Injectable()
export class FicheClientStore {
  private readonly service = inject(AdminCompaniesService);
  private readonly settingsService = inject(PlatformSettingsService);
  private readonly pickupsService = inject(PickupAddressesService);

  /** L'identifiant de la société, `null` quand on est en train de l'ouvrir. */
  readonly companyId = signal<string | null>(null);

  readonly state = signal<LoadState>('loading');
  readonly company = signal<AdminCompanyDetail | null>(null);
  readonly settings = signal<PlatformSettings | null>(null);
  /** Les points de retrait de la plateforme (le défaut en tête). */
  readonly pickups = signal<readonly PickupAddressView[]>([]);

  /** Mode **ouverture** : la société n'existe pas encore. */
  readonly draft = computed(() => this.companyId() === null);

  /** Le point par défaut, reflété quand la livraison est masquée. */
  readonly defaultPickup = computed(
    () => this.pickups().find((point) => point.isDefault) ?? this.pickups()[0] ?? null,
  );

  /**
   * Le KBIS est-il **exigé** pour activer ce compte ? La carte d'identité ne
   * peut pas le savoir seule : cela dépend de la configuration de la plateforme,
   * et un rappel qui se trompe d'exigence fait réclamer une pièce facultative au
   * client.
   */
  readonly kbisRequirement = computed<PieceMode>(() => this.settings()?.kbis ?? 'hidden');

  /** La livraison est-elle masquée (service absent) ? Cache la carte livraison. */
  readonly deliveryHidden = computed(() => this.settings()?.delivery === 'hidden');

  readonly identity = computed<CompanyIdentityView | null>(() => {
    const company = this.company();
    return company === null ? null : toIdentityView(company);
  });

  readonly contacts = computed<CompanyContactCardView[]>(() => {
    const company = this.company();
    return company === null ? [] : toContactCards(company);
  });

  readonly billing = computed<BillingAddressView | null>(
    () => this.company()?.addresses.billing ?? null,
  );

  readonly deliveries = computed<readonly DeliveryAddressView[]>(
    () => this.company()?.addresses.deliveries ?? [],
  );

  /** Ce qu'il reste à compléter — sans société, c'est **tout** (mode ouverture). */
  private readonly steps = computed<readonly ActivationStep[]>(() =>
    activationSteps(this.company(), this.settings()),
  );

  /** Étapes projetées vers le view-model de la lib (ajout du `kind` d'UI). */
  readonly libSteps = computed<readonly CompanyActivationStep[]>(() =>
    this.steps().map((step) => ({ ...step, kind: step.key === 'kbis' ? 'file' : 'action' })),
  );

  /** Vrai quand il ne reste que la condition de règlement (les pièces sont là). */
  readonly ready = computed(
    () => !this.draft() && this.steps().every((step) => step.key === 'payment'),
  );

  /** Le compte est-il en attente d'activation ? (Le CTA n'a de sens que là.) */
  readonly isPending = computed(() => this.company()?.status === 'pending');

  /**
   * Où en est le compte — les **quatre** états, pas « en attente ou pas ». Le
   * rail affichait « Compte actif » à un compte suspendu, en contradiction avec
   * le badge d'en-tête de la fiche. Défaut `pending` : une fiche pas encore
   * chargée n'affirme rien de plus que le point de départ.
   */
  readonly status = computed<CompanyStatus>(() => this.company()?.status ?? 'pending');

  /**
   * Le compte peut-il être activé ? Le bouton doit dire la même chose que le
   * serveur : en attente, pièces requises réunies, **et** identité légale
   * complète — sans SIRET il n'y a rien à facturer, et le serveur refuse.
   */
  readonly canActivate = computed(() => {
    const company = this.company();
    if (company === null || !this.isPending()) {
      return false;
    }
    return (
      hasLegalIdentity(company) &&
      isReachable(company) &&
      missingRequiredPieces(company, this.settings()).length === 0
    );
  });

  /** Ce qui bloque l'activation, en une phrase ; vide quand rien ne bloque. */
  readonly blockedReason = computed(() => {
    const company = this.company();
    if (company === null || this.canActivate()) {
      return '';
    }
    if (!hasLegalIdentity(company)) {
      return "Raison sociale, forme juridique et SIRET sont nécessaires : sans eux, il n'y a rien à facturer.";
    }
    if (!isReachable(company)) {
      return 'Aucun interlocuteur joignable : renseignez au moins un numéro de téléphone.';
    }
    // Le cas le plus fréquent et le moins devinable : la pièce est là, elle
    // n'a simplement pas été vérifiée. Le dire évite de chercher ce qui manque.
    if (missingRequiredPieces(company, this.settings()).includes('kbis') && company.kbis !== null) {
      return "L'extrait KBIS est déposé mais pas encore vérifié : ouvrez-le, comparez-le à l'identité, puis confirmez.";
    }
    return 'Il reste des pièces à réunir.';
  });

  /** Pose l'identifiant de route avant le premier chargement. */
  start(companyId: string | null): void {
    this.companyId.set(companyId);
  }

  /**
   * Le compte vient d'être ouvert : la page devient sa fiche **sans navigation
   * visible**, donc sans état de chargement — le commercial reste où il en était.
   */
  adopt(companyId: string): void {
    this.companyId.set(companyId);
  }

  /**
   * (Re)charge la fiche.
   *
   * L'écran de chargement n'apparaît qu'au **premier** passage. Après une
   * mutation, la fiche est déjà à l'écran : la remplacer par un « Chargement… »
   * la démonte, et la position de lecture est perdue — le commercial qui vient
   * de régler une section se retrouvait en haut de page.
   */
  async load(): Promise<void> {
    const id = this.companyId();
    if (this.state() !== 'ready') {
      this.state.set('loading');
    }
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
      this.pickups.set(pickups);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
