import { signal } from '@angular/core';

import type { FulfillmentMethod, FulfillmentWindow, StaffSettlement } from '@lfd/contracts';

import type { FulfillmentChoice } from './acheminement-commande/acheminement-commande';
import type { OrderEntryKind } from './immediate-pickup';

/** Le choix « une autre adresse » — sentinelle, jamais un identifiant. */
export const NEW_ADDRESS = '__new__';

/** Une adresse **dictée** au téléphone, en cours de saisie. */
export interface DraftAddress {
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
}

export const EMPTY_ADDRESS: DraftAddress = {
  ligne1: '',
  ligne2: '',
  codePostal: '',
  ville: '',
};

/** L'état sérialisable du brouillon — ce qu'on garde, ce qu'on relit. */
export interface DraftSnapshot {
  readonly buyerUserId: string | null;
  readonly method: FulfillmentMethod;
  readonly pickupId: string;
  readonly addressId: string;
  readonly address: DraftAddress;
  readonly keepAddress: boolean;
  /** La tranche convenue, ou `null` — le commercial n'a pas encore choisi. */
  readonly window: FulfillmentWindow | null;
  readonly requestedDate: string;
  readonly note: string;
  readonly settlement: StaffSettlement;
}

/**
 * **Tout ce qui n'est pas un article** dans la commande en cours de saisie : à
 * qui elle est portée, comment elle s'achemine, quand, avec quelle note, et
 * comment elle se règle.
 *
 * Une classe de signaux comme {@link CartStore}, et pour la même raison — une
 * instance par écran, jamais un service racine : deux onglets ouverts sur deux
 * clients ne partagent pas un brouillon.
 *
 * **Pourquoi l'état sort des composants.** Il vivait dans le panier et dans le
 * sélecteur d'acheminement. En mobile, le panier s'ouvre en tiroir : le panneau
 * est monté à l'ouverture et détruit à la fermeture, donc la date, la note et le
 * mode de règlement disparaissaient à chaque aller-retour vers le catalogue —
 * silencieusement, ce qui est le pire des deux mondes. Ici, ils survivent au
 * composant qui les affiche. C'est aussi ce qui rend le brouillon **copiable**
 * d'un coup, pour le mettre de côté et le reprendre.
 */
export class DraftStore {
  readonly buyerUserId = signal<string | null>(null);
  readonly method = signal<FulfillmentMethod>('pickup');
  /** `''` = le point par défaut. */
  readonly pickupId = signal('');
  /** `''` = la première du carnet ; {@link NEW_ADDRESS} = la saisie. */
  readonly addressId = signal('');
  readonly address = signal<DraftAddress>(EMPTY_ADDRESS);
  readonly keepAddress = signal(false);
  /**
   * La tranche de retrait convenue. `null` = **pas encore choisie**, et le
   * panier refuse de partir tant qu'elle l'est.
   *
   * Le premier créneau du point est pré-rempli, pour que le panier ait son
   * prix sans attendre (décidé par Hugo le 2026-11-21) — et marqué
   * {@link windowProposed} tant que le commercial ne l'a pas choisi : une heure
   * suggérée ne doit pas se lire comme une heure convenue avec le client.
   */
  readonly window = signal<FulfillmentWindow | null>(null);
  /** La tranche est celle que l'écran a proposée, personne ne l'a choisie. */
  readonly windowProposed = signal(false);
  readonly requestedDate = signal(tomorrowIso());
  /** La date est celle de départ (demain), personne ne l'a choisie. */
  readonly dateProposed = signal(true);
  readonly note = signal('');
  readonly settlement = signal<StaffSettlement>('link');
  /**
   * « Retrait immédiat » ou « Commande programmée » (lot L6, comptoir). Hors
   * du brouillon conservé : un raccourci vaut pour l'instant où le client est
   * devant le comptoir, jamais pour une saisie reprise plus tard.
   */
  readonly entry = signal<OrderEntryKind>('scheduled');
  /**
   * L'engagement budgétaire d'un organisme public (plan clients publics,
   * § 6 quater) : le numéro de son bon de commande et le code service. Hors
   * du brouillon conservé — il ne voyage qu'avec la passation, et
   * l'estimation l'ignore. Le code se préremplit du défaut de la fiche.
   */
  readonly commitmentNumber = signal('');
  readonly commitmentServiceCode = signal('');

  /**
   * « Passer outre » la limite d'un produit (plan des dépassements, § 3.5) :
   * le geste ouvert, et son motif. Hors du brouillon conservé — un motif vaut
   * pour la saisie en cours, jamais pour une reprise un autre jour.
   */
  readonly itemLimitOverriding = signal(false);
  readonly itemLimitReason = signal('');
  /**
   * Le serveur a refusé faute de motif : le panier se rouvre sur ses lignes,
   * où vit le champ, puis remet le drapeau à faux.
   */
  readonly itemLimitReasonAsked = signal(false);

  /**
   * L'acheminement **résolu** par le sélecteur (point, adresse, tranche, et ce
   * qui manque encore) — `null` tant qu'il n'a rien émis. Une dérivation, pas
   * une décision : hors du brouillon conservé. Il vit ici et non dans la
   * colonne parce que la page en a besoin pour composer l'estimation (lot P2),
   * y compris quand le panier est replié dans son tiroir.
   */
  readonly fulfillment = signal<FulfillmentChoice | null>(null);

  /** Modifie un champ de l'adresse dictée. */
  patchAddress(patch: Partial<DraftAddress>): void {
    this.address.update((address) => ({ ...address, ...patch }));
  }

  snapshot(): DraftSnapshot {
    return {
      buyerUserId: this.buyerUserId(),
      method: this.method(),
      pickupId: this.pickupId(),
      addressId: this.addressId(),
      address: this.address(),
      keepAddress: this.keepAddress(),
      window: this.window(),
      requestedDate: this.requestedDate(),
      note: this.note(),
      settlement: this.settlement(),
    };
  }

  restore(snapshot: DraftSnapshot): void {
    this.buyerUserId.set(snapshot.buyerUserId);
    this.method.set(snapshot.method);
    this.pickupId.set(snapshot.pickupId);
    this.addressId.set(snapshot.addressId);
    this.address.set(snapshot.address);
    this.keepAddress.set(snapshot.keepAddress);
    this.window.set(snapshot.window);
    this.requestedDate.set(snapshot.requestedDate);
    this.note.set(snapshot.note);
    this.settlement.set(snapshot.settlement);
    // Un brouillon repris porte des choix : ils ne sont plus des propositions.
    this.windowProposed.set(false);
    this.dateProposed.set(false);
  }

  reset(): void {
    this.entry.set('scheduled');
    this.commitmentNumber.set('');
    this.commitmentServiceCode.set('');
    this.itemLimitOverriding.set(false);
    this.itemLimitReason.set('');
    this.itemLimitReasonAsked.set(false);
    this.restore({
      buyerUserId: null,
      method: 'pickup',
      pickupId: '',
      addressId: '',
      address: EMPTY_ADDRESS,
      keepAddress: false,
      window: null,
      requestedDate: tomorrowIso(),
      note: '',
      settlement: 'link',
    });
    this.dateProposed.set(true);
  }
}

/**
 * Demain, en `AAAA-MM-JJ` local. Le jour de service est **obligatoire** ; le
 * proposer à J+1 plutôt que vide colle au cas courant (on saisit la veille pour
 * le lendemain) et évite d'ouvrir l'écran sur un bouton déjà bloqué.
 */
export function tomorrowIso(): string {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  const month = `${day.getMonth() + 1}`.padStart(2, '0');
  return `${day.getFullYear()}-${month}-${`${day.getDate()}`.padStart(2, '0')}`;
}
