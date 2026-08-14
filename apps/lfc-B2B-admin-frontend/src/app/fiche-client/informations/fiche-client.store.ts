import { computed, inject, Injectable, signal } from '@angular/core';
import { DELIVERY_SERVICE_OPEN } from '@lfd/b2b-ui/flags';
import type {
  BillingAddressView,
  CompanyStatus,
  DeliveryAddressView,
  PickupAddressView,
} from '@lfd/contracts';
import type {
  CompanyActivationStep,
  CompanyContactCardView,
  CompanyIdentityView,
} from '@lfd/b2b-ui/company';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { PickupAddressesService } from '../../reglages/retraits-livraisons/pickup-addresses.service';
import { toContactCards, toIdentityView } from '../admin-company-view';
import { activationSteps, blockedReason, type ActivationStep } from './activation-steps';

/** Où en est la lecture de la fiche. */
export type LoadState = 'loading' | 'ready' | 'error' | 'notfound';

/**
 * Ce que la fiche client **lit** : la société, les points de retrait — et tout
 * ce qui s'en déduit.
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
  private readonly pickupsService = inject(PickupAddressesService);

  /** L'identifiant de la société, `null` quand on est en train de l'ouvrir. */
  readonly companyId = signal<string | null>(null);

  readonly state = signal<LoadState>('loading');
  readonly company = signal<AdminCompanyDetail | null>(null);
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

  /** La livraison est-elle masquée (service absent) ? Cache la carte livraison. */
  readonly deliveryHidden = !DELIVERY_SERVICE_OPEN;

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

  /** Ce qu'il reste à compléter — habillage du verdict serveur, rien de plus. */
  private readonly steps = computed<readonly ActivationStep[]>(() =>
    activationSteps(this.company()),
  );

  /** Étapes projetées vers le view-model de la lib (ajout du `kind` d'UI). */
  readonly libSteps = computed<readonly CompanyActivationStep[]>(() =>
    // Seul le KBIS **absent** prend un fichier ; « à vérifier » est un geste,
    // pas un dépôt.
    this.steps().map((step) => ({ ...step, kind: step.key === 'kbis' ? 'file' : 'action' })),
  );

  /**
   * Le dossier est-il **complet** ? C'est le verdict serveur, pas un décompte
   * de pièces : il annonçait « toutes les pièces sont réunies — le compte peut
   * être activé » à côté d'un bouton grisé, parce qu'il ignorait l'identité
   * légale et la joignabilité. Rien ne bloque = rien ne bloque.
   */
  readonly ready = computed(() => !this.draft() && this.company()?.gate.blocking.length === 0);

  /** Combien d'empêchements le serveur oppose — 0 quand le dossier est complet. */
  readonly blockingCount = computed(() => this.company()?.gate.blocking.length ?? 0);

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
   * Le compte peut-il être activé ? **Le serveur l'a dit.**
   *
   * Cet écran refaisait le calcul (identité légale, joignabilité, pièces
   * requises) et les deux versions ont divergé. La règle n'est plus écrite
   * qu'une fois, côté domaine ; ici on lit un booléen.
   */
  readonly canActivate = computed(() => this.company()?.gate.canActivate === true);

  /** Ce qui bloque l'activation, en une phrase ; vide quand rien ne bloque. */
  readonly blockedReason = computed(() => blockedReason(this.company()));

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
      const [company, pickups] = await Promise.all([
        id === null ? Promise.resolve(undefined) : this.service.getById(id),
        this.pickupsService.list().catch(() => [] as readonly PickupAddressView[]),
      ]);
      // Un compte qu'on ouvre n'a pas d'id : l'absence est ATTENDUE, elle ne
      // vaut pas « introuvable ».
      if (company === undefined && id !== null) {
        this.state.set('notfound');
        return;
      }
      this.company.set(company ?? null);
      this.pickups.set(pickups);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
