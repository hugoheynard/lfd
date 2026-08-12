import { computed, inject, Injectable } from '@angular/core';
import type { DeferredTerm, DeliveryAddressView, FulfillmentPreferenceView } from '@lfd/contracts';
import { isCompanyIdentityOpenable, type CompanyIdentityDraft } from '@lfd/b2b-ui/company';

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
  readonly defaultPickup = this.store.defaultPickup;
  readonly kbisRequirement = this.store.kbisRequirement;
  readonly deliveryHidden = this.store.deliveryHidden;
  readonly libSteps = this.store.libSteps;
  readonly ready = this.store.ready;
  readonly isPending = this.store.isPending;
  readonly canActivate = this.store.canActivate;
  readonly blockedReason = this.store.blockedReason;

  // ── Ce qui est en cours ─────────────────────────────────────────────────
  readonly creating = this.actions.creating;
  readonly granting = this.actions.granting;

  /** Combien de pièces restent à réunir — le rail d'activation le dit. */
  readonly remaining = computed(() => this.libSteps().length);

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
   * Un nom de société et quelqu'un à qui l'ouvrir : c'est tout. Papiers et
   * adresses viendront après — ce qui bloque ici bloque une saisie faite devant
   * le client.
   */
  canOpen(identity: CompanyIdentityDraft, holder: HolderChoice | null): boolean {
    return isCompanyIdentityOpenable(identity) && holder !== null;
  }

  /**
   * Ouvre le compte puis **reste sur la page** : la fiche prend la place du
   * formulaire, les sections en attente s'allument, le commercial continue là où
   * il en était. Rend l'identifiant créé pour que l'appelant règle l'URL.
   */
  async openAccount(identity: CompanyIdentityDraft, holder: HolderChoice): Promise<string | null> {
    const id = await this.actions.openAccount(identity, holder);
    if (id !== null) {
      this.store.adopt(id);
      await this.store.load();
    }
    return id;
  }

  // ── Gestes sur une fiche existante ──────────────────────────────────────

  activate(): Promise<void> {
    return this.mutate((company) => this.actions.activate(company));
  }

  uploadKbis(file: File): Promise<void> {
    return this.mutate((company) => this.actions.uploadKbis(company, file));
  }

  /** Certifie le KBIS — le geste qui débloque l'activation. */
  certifyKbis(): Promise<void> {
    return this.mutate((company) => this.actions.certifyKbis(company));
  }

  /** Retire la certification posée par erreur. */
  revokeKbisCertification(): Promise<void> {
    return this.mutate((company) => this.actions.revokeKbisCertification(company));
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
  openStep(key: string): void {
    this.afterPanel((company) => this.panels.openStep(key, company));
  }

  /** Ajoute une adresse de livraison. */
  addDelivery(): void {
    this.afterPanel((company) => this.panels.openNewDelivery(company));
  }

  /** Corrige une adresse de livraison — le même panneau, prérempli. */
  editDelivery(address: DeliveryAddressView): void {
    this.afterPanel((company) => this.panels.openDelivery(company, address));
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
