import { inject, Injectable, signal } from '@angular/core';

import { AdminCompaniesService } from '../admin-companies.service';
import type { AdminCompany } from '../admin-company';
import { CompanyWrites } from './company-writes';

/**
 * Au-delà de cet âge, la page Comptes clients rouverte relit la liste : ce que
 * les clients ont changé eux-mêmes (un KBIS déposé, une adresse) ne passe par
 * aucune écriture du back-office, et cinq minutes est l'ancienneté qu'on
 * accepte de montrer sur la page qui sert à agir.
 */
export const COMPANY_LIST_MAX_AGE_MS = 5 * 60 * 1000;

/** Ce qu'un lecteur peut exiger de la fraîcheur de la liste. */
export interface CompanyListReadOptions {
  /** Relire si la dernière lecture est plus vieille que cela. Absent : toute lecture convient. */
  readonly maxAgeMs?: number;
}

interface Snapshot {
  readonly companies: readonly AdminCompany[];
  readonly readAt: number;
  readonly version: number;
}

/**
 * **La liste des sociétés, lue une fois par session** et partagée par la page
 * Comptes clients, la grille de prix et le rattachement d'un sous-compte.
 *
 * `GET /admin/companies` rend toute la table ; la relire à chaque ouverture
 * d'un de ces écrans coûtait la table à chaque fois. Le magasin la garde, et
 * la relit :
 *
 * - après toute écriture du back-office ({@link CompanyWrites}) — écrire puis
 *   relire montre toujours l'état neuf ;
 * - quand un lecteur exige une fraîcheur (`maxAgeMs`) que la copie n'a plus.
 *
 * Deux lecteurs qui demandent ensemble partagent UNE requête. La recherche, les
 * filtres et la pagination restent à l'écran : le magasin ne rend que la table.
 */
@Injectable({ providedIn: 'root' })
export class CompanyListStore {
  private readonly api = inject(AdminCompaniesService);
  private readonly writes = inject(CompanyWrites);

  private snapshot: Snapshot | null = null;
  private inFlight: {
    readonly promise: Promise<readonly AdminCompany[]>;
    readonly version: number;
  } | null = null;
  private readonly current = signal<readonly AdminCompany[] | null>(null);

  /** La dernière liste lue, ou `null` tant qu'aucune lecture n'a abouti. */
  readonly companies = this.current.asReadonly();

  /**
   * La liste, de la copie si elle convient, sinon du serveur.
   *
   * Un échec est relancé et ne remplace rien : la copie précédente reste.
   */
  list(options: CompanyListReadOptions = {}): Promise<readonly AdminCompany[]> {
    const version = this.writes.version();
    if (this.snapshot !== null && this.isFresh(this.snapshot, version, options)) {
      return Promise.resolve(this.snapshot.companies);
    }
    if (this.inFlight !== null && this.inFlight.version === version) {
      return this.inFlight.promise;
    }
    const promise = this.readFromServer(version);
    this.inFlight = { promise, version };
    return promise;
  }

  private isFresh(snapshot: Snapshot, version: number, options: CompanyListReadOptions): boolean {
    if (snapshot.version !== version) {
      return false;
    }
    return options.maxAgeMs === undefined || Date.now() - snapshot.readAt <= options.maxAgeMs;
  }

  private async readFromServer(version: number): Promise<readonly AdminCompany[]> {
    try {
      const companies = await this.api.list();
      // Le cran de DÉPART : une écriture survenue pendant la lecture la rend
      // déjà périmée, et le lecteur suivant relira.
      if (this.snapshot === null || version >= this.snapshot.version) {
        this.snapshot = { companies, readAt: Date.now(), version };
        this.current.set(companies);
      }
      return companies;
    } finally {
      if (this.inFlight?.version === version) {
        this.inFlight = null;
      }
    }
  }
}
