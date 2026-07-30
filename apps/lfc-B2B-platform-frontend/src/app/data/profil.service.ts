import { computed, Injectable, signal } from '@angular/core';

import type {
  Adresse,
  AdresseLivraison,
  ClientProfile,
  Contact,
  DeliveryContact,
  Etablissement,
  PaymentTerm,
} from './profil.model';

/** Charge de création/édition de l'adresse de facturation (sans l'`id` géré ici). */
export type AdresseDraft = Omit<Adresse, 'id'>;

/** Charge de création/édition d'une adresse de livraison (note + créneaux compris). */
export type AdresseLivraisonDraft = Omit<AdresseLivraison, 'id'>;

/**
 * Source de vérité du profil client pro — pour l'instant **en mémoire**, semée
 * avec un client réaliste. Quand l'API B2B (Prisma) existera, ce service gardera
 * la même surface (signaux + mutations) et branchera ses méthodes sur le
 * backend ; les pages n'auront pas à changer.
 *
 * Les mutations reconstruisent l'objet immuable (`readonly` partout) plutôt que
 * de muter en place — un `set` sur le signal, la vue se recale toute seule.
 */
@Injectable({ providedIn: 'root' })
export class ProfilService {
  private readonly state = signal<ClientProfile>(SEED);

  /** Le profil complet, en lecture. */
  readonly profile = this.state.asReadonly();

  /**
   * Adresses de livraison, **l'adresse par défaut toujours en tête**. Le tri est
   * stable (comparateur sur le seul `isDefaut`) : les autres gardent leur ordre.
   */
  readonly adressesLivraison = computed(() =>
    [...this.state().adressesLivraison].sort((a, b) => Number(b.isDefaut) - Number(a.isDefaut)),
  );
  readonly representant = computed(() => this.state().representant);

  /**
   * Contacts connus de l'app, proposés pour préremplir un contact de livraison :
   * le contact principal et le représentant s'il existe. Réduit à `prenom`/`nom`/
   * `telephone` — la partie utile pour le livreur.
   */
  readonly knownContacts = computed<readonly DeliveryContact[]>(() => {
    const p = this.state();
    const people: Contact[] = p.representant ? [p.contact, p.representant] : [p.contact];
    return people.map((c) => ({ prenom: c.prenom, nom: c.nom, telephone: c.telephone }));
  });

  updateEtablissement(etablissement: Etablissement): void {
    this.state.update((p) => ({ ...p, etablissement }));
  }

  updateContact(contact: Contact): void {
    this.state.update((p) => ({ ...p, contact }));
  }

  /** Ajoute, remplace ou retire (`null`) le représentant / gestionnaire. */
  setRepresentant(representant: Contact | null): void {
    this.state.update((p) => ({ ...p, representant }));
  }

  updatePaymentTerm(paymentTerm: PaymentTerm): void {
    this.state.update((p) => ({ ...p, paymentTerm }));
  }

  /** Met à jour l'unique adresse de facturation (jamais « par défaut »). */
  updateBillingAddress(draft: AdresseDraft): void {
    this.state.update((p) => ({
      ...p,
      adresseFacturation: { ...draft, id: p.adresseFacturation.id, isDefaut: false },
    }));
  }

  /**
   * Crée (id absent) ou remplace (id fourni) une adresse de livraison. Si le
   * brouillon est marqué par défaut, il devient le seul par défaut ; la toute
   * première adresse ajoutée est promue par défaut d'office.
   */
  saveDeliveryAddress(draft: AdresseLivraisonDraft, id: string | null): void {
    this.state.update((p) => {
      const list = p.adressesLivraison;
      const targetId = id ?? nextAddressId(list);
      const wantsDefault = draft.isDefaut || list.length === 0;
      const next =
        id === null ? [...list, { ...draft, id: targetId }] : replaceById(list, targetId, draft);
      return { ...p, adressesLivraison: normaliseDefault(next, wantsDefault ? targetId : null) };
    });
  }

  /** Retire une adresse de livraison ; réattribue le défaut si besoin. */
  removeDeliveryAddress(id: string): void {
    this.state.update((p) => {
      const removedWasDefault = p.adressesLivraison.find((a) => a.id === id)?.isDefaut ?? false;
      const kept = p.adressesLivraison.filter((a) => a.id !== id);
      const promoteId = removedWasDefault ? (kept[0]?.id ?? null) : null;
      return { ...p, adressesLivraison: normaliseDefault(kept, promoteId) };
    });
  }

  /** Désigne l'adresse de livraison par défaut. */
  setDefaultDelivery(id: string): void {
    this.state.update((p) => ({
      ...p,
      adressesLivraison: normaliseDefault(p.adressesLivraison, id),
    }));
  }
}

/** Remplace l'adresse `id` par le brouillon, en conservant son `id`. */
function replaceById(
  list: readonly AdresseLivraison[],
  id: string,
  draft: AdresseLivraisonDraft,
): AdresseLivraison[] {
  return list.map((a) => (a.id === id ? { ...draft, id } : a));
}

/**
 * Garantit l'invariant « au plus une adresse par défaut ». Si `defaultId` est
 * fourni, il gagne ; sinon on conserve un défaut existant, ou on promeut la
 * première quand aucune n'est marquée (une liste non vide a toujours un défaut).
 */
function normaliseDefault(
  list: readonly AdresseLivraison[],
  defaultId: string | null,
): AdresseLivraison[] {
  if (list.length === 0) {
    return [];
  }
  const chosen = defaultId ?? list.find((a) => a.isDefaut)?.id ?? list[0]?.id ?? null;
  return list.map((a) => ({ ...a, isDefaut: a.id === chosen }));
}

/** Id incrémental stable (SSR-safe : pas de `Math.random`/`Date.now`). */
function nextAddressId(list: readonly AdresseLivraison[]): string {
  const max = list.reduce((acc, a) => {
    const n = Number.parseInt(a.id.replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? acc : Math.max(acc, n);
  }, 0);
  return `liv_${max + 1}`;
}

/** Client de démonstration — une boulangerie-pâtisserie parisienne multi-boutiques. */
const SEED: ClientProfile = {
  etablissement: {
    raisonSociale: 'Boulangerie du Marais SAS',
    enseigne: 'Le Pain Quotidien du Marais',
    formeJuridique: 'SAS',
    siret: '812 456 789 00021',
    tvaIntracom: 'FR32 812456789',
  },
  contact: {
    prenom: 'Camille',
    nom: 'Rousseau',
    fonction: 'Gérante',
    email: 'camille.rousseau@pqmarais.fr',
    telephone: '01 42 71 08 44',
  },
  representant: {
    prenom: 'Karim',
    nom: 'Benali',
    fonction: 'Responsable des achats',
    email: 'achats@pqmarais.fr',
    telephone: '06 12 88 54 30',
  },
  adresseFacturation: {
    id: 'fact_1',
    label: 'Siège',
    ligne1: '18 rue des Archives',
    ligne2: '',
    codePostal: '75004',
    ville: 'Paris',
    pays: 'France',
    isDefaut: false,
  },
  adressesLivraison: [
    {
      id: 'liv_1',
      label: 'Boutique Archives',
      ligne1: '18 rue des Archives',
      ligne2: 'Réception par la cour',
      codePostal: '75004',
      ville: 'Paris',
      pays: 'France',
      isDefaut: true,
      note: "Sonner à l'interphone « Boulangerie ». Livraison par la cour, pas la vitrine.",
      slots: { mode: 'everyday', slot: { start: '07:00', end: '09:00' } },
      deliveryContact: { prenom: 'Camille', nom: 'Rousseau', telephone: '01 42 71 08 44' },
      gps: { lat: 48.8592, lng: 2.3616 },
    },
    {
      id: 'liv_2',
      label: 'Boutique Bastille',
      ligne1: '9 rue de la Roquette',
      ligne2: '',
      codePostal: '75011',
      ville: 'Paris',
      pays: 'France',
      isDefaut: false,
      note: '',
      slots: {
        mode: 'perDay',
        byDay: {
          mon: { start: '06:30', end: '08:00' },
          tue: null,
          wed: { start: '06:30', end: '08:00' },
          thu: null,
          fri: { start: '06:30', end: '08:00' },
          sat: { start: '07:30', end: '09:00' },
          sun: null,
        },
      },
      deliveryContact: null,
      gps: null,
    },
  ],
  paymentTerm: 'monthly',
};
