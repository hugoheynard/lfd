import { computed, inject, Injectable, signal } from '@angular/core';
import type { DeferredTerm, DeliveryAddressView, FulfillmentPreferenceView } from '@lfd/contracts';
import { isCompanyIdentityOpenable, type CompanyIdentityDraft } from '@lfd/b2b-ui/company';

import type { InitialBillingMode } from '../facturation/initial-billing-mode';
import type { HolderChoice } from '../holder-picker/holder-picker';
import { FicheClientActions } from './fiche-client.actions';
import { FicheClientPanels } from './fiche-client.panels';
import { FicheClientStore } from './fiche-client.store';

/**
 * **Façade** de la fiche client : le seul interlocuteur du composant.
 *
 * Derrière elle, trois responsabilités qui n'ont pas les mêmes raisons de
 * changer — {@link FicheClientStore} (ce qui est à l'écran),
 * {@link FicheClientPanels} (quel panneau, avec quelle charge) et
 * {@link FicheClientActions} (muter, annoncer). La façade est ce qui les recoud :
 * elle sait qu'un geste réussi se recharge, et qu'un panneau fermé aussi.
 *
 * C'est le seul endroit où cette couture est écrite. Sans elle, chaque méthode
 * du composant la réécrivait — et il suffisait d'en oublier une pour que l'écran
 * mente jusqu'au prochain F5.
 *
 * Le composant n'injecte donc que ceci : il lit des signaux, il appelle des
 * gestes. Il ne connaît ni le service HTTP, ni les panneaux, ni l'ordre des
 * opérations.
 */
@Injectable()
export class FicheClientFacade {
  private readonly store = inject(FicheClientStore);
  private readonly panels = inject(FicheClientPanels);
  private readonly actions = inject(FicheClientActions);

  // ── Ce qui est à l'écran ────────────────────────────────────────────────
  readonly state = this.store.state;
  readonly company = this.store.company;
  readonly draft = this.store.draft;
  readonly identity = this.store.identity;
  readonly contacts = this.store.contacts;
  readonly billing = this.store.billing;
  readonly deliveries = this.store.deliveries;
  readonly pickups = this.store.pickups;
  readonly preselectedPickup = this.store.preselectedPickup;
  readonly deliveryHidden = this.store.deliveryHidden;
  /** Le réglage général « créneau ou échéance » (CA-D2), dont héritent les adresses. */
  readonly windowMode = computed(() => this.store.deliveryAvailability().windowMode);
  readonly libSteps = this.store.libSteps;
  readonly ready = this.store.ready;
  readonly isPending = this.store.isPending;
  /** Les quatre états du compte — le rail droit les distingue tous. */
  readonly status = this.store.status;
  readonly blockingCount = this.store.blockingCount;
  readonly canActivate = this.store.canActivate;
  readonly blockedReason = this.store.blockedReason;

  // ── Ce qui est en cours ─────────────────────────────────────────────────
  readonly creating = this.actions.creating;
  readonly granting = this.actions.granting;
  readonly preferring = this.actions.preferring;

  /** Combien de pièces restent à réunir — le rail d'activation le dit. */
  /** Ce qui empêche d'activer — et non le nombre de lignes affichées. */
  readonly remaining = this.store.blockingCount;

  /** Démarre la fiche sur l'identifiant de route (`null` = ouverture). */
  async start(companyId: string | null): Promise<void> {
    this.store.start(companyId);
    await this.store.load();
  }

  /** Recharge la fiche (le panneau fermé, la mutation faite). */
  reload(): Promise<void> {
    return this.store.load();
  }

  // ── Ouverture d'un compte ───────────────────────────────────────────────

  /**
   * Un nom de société : c'est tout. Papiers, adresses et **détenteur** viennent
   * après — ce qui bloque ici bloque une saisie faite devant le client, et le
   * commercial n'a souvent au téléphone que le nom de la maison.
   */
  canOpen(identity: CompanyIdentityDraft): boolean {
    return isCompanyIdentityOpenable(identity);
  }

  /** Rattache le détenteur d'un compte ouvert sans lui, puis relit la fiche. */
  attachHolder(holder: HolderChoice): Promise<void> {
    return this.mutate((company) => this.actions.attachHolder(company, holder));
  }

  /**
   * Ouvre le compte puis **reste sur la page** : la fiche prend la place du
   * formulaire, les sections en attente s'allument, le commercial continue là où
   * il en était. Rend l'identifiant créé pour que l'appelant règle l'URL.
   */
  async openAccount(
    identity: CompanyIdentityDraft,
    holder: HolderChoice | null,
    billingMode: InitialBillingMode = { kind: 'not-required' },
  ): Promise<string | null> {
    const id = await this.actions.openAccount(identity, holder);
    if (id !== null) {
      // Avant la relecture : la carte du mode lit la fiche une fois rechargée.
      await this.actions.applyInitialBillingMode(id, billingMode);
      this.store.adopt(id);
      await this.store.load();
    }
    return id;
  }

  // ── Gestes sur une fiche existante ──────────────────────────────────────

  /** Active, puis pose le mode choisi — un mode refusé n'annule pas l'activation. */
  activate(billingMode: InitialBillingMode = { kind: 'not-required' }): Promise<void> {
    return this.mutate(async (company) => {
      const activated = await this.actions.activate(company);
      if (activated) {
        await this.actions.applyInitialBillingMode(company.id, billingMode);
      }
      return activated;
    });
  }

  uploadKbis(file: File): Promise<void> {
    return this.mutate((company) => this.actions.uploadKbis(company, file));
  }

  /**
   * Le geste de certification est-il ouvert ? Il demande la date de délivrance
   * de l'extrait : la carte d'identité comme la synthèse d'activation l'ouvrent.
   */
  readonly certifyingKbis = signal(false);

  /**
   * Certifie le KBIS — le geste qui débloque l'activation. Rend le motif d'un
   * refus (le geste reste ouvert), `null` une fois fait (il se referme).
   */
  async certifyKbis(issuedOn: string): Promise<string | null> {
    const company = this.company();
    if (company === null) {
      return null;
    }
    const refusal = await this.actions.certifyKbis(company, issuedOn);
    if (refusal === null) {
      this.certifyingKbis.set(false);
      await this.store.load();
    }
    return refusal;
  }

  /** Retire la certification posée par erreur. */
  revokeKbisCertification(): Promise<void> {
    return this.mutate((company) => this.actions.revokeKbisCertification(company));
  }

  /** Réactive un compte suspendu (suspension staff uniquement). */
  reactivate(): Promise<void> {
    return this.mutate((company) => this.actions.reactivate(company));
  }

  grantTerms(terms: readonly DeferredTerm[]): Promise<void> {
    return this.mutate((company) => this.actions.grantTerms(company, terms));
  }

  preferFulfillment(preference: FulfillmentPreferenceView): Promise<void> {
    return this.mutate((company) => this.actions.preferFulfillment(company, preference));
  }

  setDefaultDelivery(address: DeliveryAddressView): Promise<void> {
    return this.mutate((company) => this.actions.setDefaultDelivery(company, address));
  }

  removeDelivery(address: DeliveryAddressView): Promise<void> {
    return this.mutate((company) => this.actions.removeDelivery(company, address));
  }

  removeContact(contactId: string): Promise<void> {
    return this.mutate((company) => this.actions.removeContact(company, contactId));
  }

  openAccess(contactId: string | null): Promise<void> {
    return this.mutate((company) => this.actions.openAccess(company, contactId));
  }

  // ── Panneaux ────────────────────────────────────────────────────────────

  /** Le panneau d'une étape d'activation ; la fiche se recharge à sa fermeture. */
  /**
   * « Modifier » sur la carte d'identité.
   *
   * Une méthode nommée plutôt qu'une clé écrite dans le gabarit : un nom de
   * méthode faux ne compile pas ; une clé d'étape fausse, si — et le clic
   * n'ouvrirait rien, sans une erreur.
   */
  editIdentity(): void {
    this.openStep('vat');
  }

  openStep(key: string): void {
    // La vérification n'ouvre aucun panneau : elle ouvre le geste de la carte
    // Identité, qui demande la date de délivrance de l'extrait.
    if (key === 'kbis_verify') {
      this.certifyingKbis.set(true);
      return;
    }
    // Le détenteur n'est pas un panneau « qu'on referme » : ce qu'il rend est la
    // saisie, et c'est la fiche qui l'envoie. D'où ce chemin propre plutôt qu'un
    // rechargement aveugle à la fermeture.
    if (key === 'holder') {
      void this.pickHolder();
      return;
    }
    this.afterPanel((company) => this.panels.openStep(key, company, this.windowMode()));
  }

  /** Demande le détenteur, puis le rattache — annuler ne fait rien. */
  private async pickHolder(): Promise<void> {
    const company = this.company();
    if (company === null) {
      return;
    }
    const holder = await this.panels.openHolder(company);
    if (holder !== null) {
      await this.attachHolder(holder);
    }
  }

  /** Ajoute une adresse de livraison. */
  addDelivery(): void {
    this.afterPanel((company) => this.panels.openNewDelivery(company, this.windowMode()));
  }

  /** Corrige une adresse de livraison — le même panneau, prérempli. */
  editDelivery(address: DeliveryAddressView): void {
    this.afterPanel((company) => this.panels.openDelivery(company, address, this.windowMode()));
  }

  /** La procédure de livraison d'une adresse ; relit la fiche si son nombre d'étapes a bougé. */
  async openProcedure(address: DeliveryAddressView): Promise<void> {
    const company = this.company();
    if (company === null) {
      return;
    }
    if (await this.panels.openProcedure(company, address)) {
      await this.store.load();
    }
  }

  /** Le panneau d'un interlocuteur existant (`null` = le détenteur). */
  editContact(contactId: string | null): void {
    this.afterPanel((company) => this.panels.openContact(company, contactId, false));
  }

  /** Le panneau d'un nouvel interlocuteur. */
  addContact(): void {
    this.afterPanel((company) => this.panels.openContact(company, null, true));
  }

  /** Un geste ne recharge que s'il a tenu : un échec laisse l'écran tel quel. */
  private async mutate(
    gesture: (company: NonNullable<ReturnType<FicheClientStore['company']>>) => Promise<boolean>,
  ): Promise<void> {
    const company = this.company();
    if (company === null) {
      return;
    }
    if (await gesture(company)) {
      await this.store.load();
    }
  }

  /** Ouvre un panneau et recharge à sa fermeture — quoi qu'il s'y soit passé. */
  private afterPanel(
    open: (
      company: NonNullable<ReturnType<FicheClientStore['company']>>,
    ) => Promise<unknown> | null,
  ): void {
    const company = this.company();
    if (company === null) {
      return;
    }
    const closed = open(company);
    if (closed !== null) {
      void closed.then(() => this.store.load());
    }
  }
}
