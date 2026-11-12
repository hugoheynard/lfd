import { Injectable, computed, inject, signal } from '@angular/core';
import type { CustomerSheetView } from '@lfd/contracts';

import { CustomerSheetService } from '../commercial/calendrier/customer-sheet/customer-sheet.service';
import { CompanyWrites } from '../comptes-clients/company-cache/company-writes';

/** Où en est la lecture du compte — les trois états que fold sait rendre. */
export type ClientSheetState = 'loading' | 'ready' | 'error';

/**
 * **La fiche du compte, lue UNE fois pour toute la coquille.**
 *
 * ## Pourquoi un magasin, et pas un chargement par vue
 *
 * L'en-tête a besoin du nom et des chiffres ; le tableau de bord a besoin des
 * mêmes chiffres, des dernières commandes et de l'historique. C'est **une seule
 * lecture** — `GET /admin/companies/:id/sheet` la rend en entier.
 *
 * Avant, la coquille chargeait la société par son id (pour le seul nom) et le
 * tableau de bord chargeait la fiche : deux appels pour un écran, et un nom qui
 * pouvait s'afficher pendant que les chiffres n'étaient pas encore là. Le front
 * multiplie les appels là où le serveur en sert un — c'est le genre d'écart qui
 * ne se rattrape pas en optimisant le serveur.
 *
 * ## Sa portée
 *
 * Fourni **par la coquille**, donc un par compte ouvert : il naît quand on entre
 * dans la fiche et meurt quand on en sort. Un magasin racine garderait le compte
 * précédent en mémoire, et le suivant s'ouvrirait sur les chiffres de l'autre.
 */
@Injectable()
export class ClientSheetStore {
  private readonly api = inject(CustomerSheetService);
  private readonly writes = inject(CompanyWrites);
  private readonly view = signal<CustomerSheetView | null>(null);
  /** Le compte porté, pour savoir quoi relire. Jamais exposé : c'est la route
   *  qui décide du compte, pas ce magasin. */
  private current: string | null = null;
  /** Le cran d'écritures auquel la fiche a été lue (cf. `CompanyWrites`). */
  private readVersion = -1;
  private inFlight: { readonly id: string; readonly promise: Promise<CustomerSheetView> } | null =
    null;
  private readonly status = signal<ClientSheetState>('loading');

  /** La fiche, ou `null` tant qu'elle n'est pas lue. */
  readonly sheet = this.view.asReadonly();
  readonly state = this.status.asReadonly();

  /** Le nom d'usage — enseigne, à défaut raison sociale. Vide avant lecture. */
  readonly displayName = computed<string>(() => {
    const sheet = this.view();
    if (sheet === null) {
      return '';
    }
    return sheet.enseigne.trim() === '' ? sheet.raisonSociale : sheet.enseigne;
  });

  /**
   * Charge le compte demandé.
   *
   * Ne vide **pas** la fiche précédente en cas d'échec : un rechargement raté
   * après une modification laisserait l'écran nu alors que les chiffres qu'on
   * avait sous les yeux restent la dernière chose vraie qu'on ait lue.
   */
  async load(id: string): Promise<void> {
    try {
      await this.readFromServer(id);
    } catch {
      // L'état `error` est posé par `readFromServer` ; la coquille le lit.
    }
  }

  /**
   * La fiche d'un compte, pour une vue qui en a besoin à son entrée
   * (statistiques, commandes, données).
   *
   * Sert la fiche déjà lue par la coquille — ou attend sa lecture en cours —
   * tant qu'aucune écriture du back-office n'est passée depuis. Sinon, relit.
   * Un échec est relancé : la vue montre son propre état d'erreur.
   */
  read(id: string): Promise<CustomerSheetView> {
    if (this.inFlight?.id === id) {
      return this.inFlight.promise;
    }
    const view = this.view();
    if (
      this.current === id &&
      view !== null &&
      this.status() === 'ready' &&
      this.readVersion === this.writes.version()
    ) {
      return Promise.resolve(view);
    }
    return this.readFromServer(id);
  }

  /**
   * Relit le compte déjà chargé — après une modification faite depuis une vue.
   *
   * Ne fait rien si aucun compte n'est chargé : appeler `reload` avant `load`
   * n'a pas de sens, et deviner un identifiant en lisant la route ferait de ce
   * magasin un second lecteur d'URL.
   */
  async reload(): Promise<void> {
    if (this.current !== null) {
      await this.load(this.current);
    }
  }

  private readFromServer(id: string): Promise<CustomerSheetView> {
    this.current = id;
    this.status.set('loading');
    const version = this.writes.version();
    const promise = this.api.sheet(id).then(
      (view) => {
        if (this.inFlight?.promise === promise) {
          this.view.set(view);
          this.readVersion = version;
          this.status.set('ready');
          this.inFlight = null;
        }
        return view;
      },
      (error: unknown) => {
        if (this.inFlight?.promise === promise) {
          this.status.set('error');
          this.inFlight = null;
        }
        throw error;
      },
    );
    this.inFlight = { id, promise };
    return promise;
  }
}
