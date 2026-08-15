import { signal } from '@angular/core';

import type { FulfillmentMethod, StaffSettlement } from '@lfd/contracts';

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
  readonly requestedDate = signal('');
  readonly note = signal('');
  readonly settlement = signal<StaffSettlement>('link');

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
    this.requestedDate.set(snapshot.requestedDate);
    this.note.set(snapshot.note);
    this.settlement.set(snapshot.settlement);
  }

  reset(): void {
    this.restore({
      buyerUserId: null,
      method: 'pickup',
      pickupId: '',
      addressId: '',
      address: EMPTY_ADDRESS,
      keepAddress: false,
      requestedDate: '',
      note: '',
      settlement: 'link',
    });
  }
}
