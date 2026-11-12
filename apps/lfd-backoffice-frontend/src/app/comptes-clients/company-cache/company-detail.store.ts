import { inject, Injectable } from '@angular/core';

import { AdminCompaniesService } from '../admin-companies.service';
import type { AdminCompanyDetail } from '../admin-company';
import { COMPANY_LIST_MAX_AGE_MS } from './company-list.store';
import { CompanyWrites } from './company-writes';

interface DetailEntry {
  readonly detail: AdminCompanyDetail | undefined;
  readonly readAt: number;
  readonly version: number;
}

interface PendingDetail {
  readonly promise: Promise<AdminCompanyDetail | undefined>;
  readonly version: number;
  /** Distingue deux lectures d'un même compte au même cran (après {@link CompanyDetailStore.forget}). */
  readonly ticket: number;
}

/**
 * **Le détail d'une société** (`GET /admin/companies/:id`), partagé par les
 * vues d'une même fiche : informations, facturation, suivi du tarif, résumé
 * des sous-comptes. Chacune le relisait à son entrée.
 *
 * Une copie sert tant qu'aucune écriture du back-office n'est passée
 * ({@link CompanyWrites}) et qu'elle a moins de {@link COMPANY_LIST_MAX_AGE_MS}.
 * La coquille de la fiche l'oublie à l'ouverture d'un compte
 * ({@link forget}) : entrer dans un dossier le relit, comme avant, et c'est
 * en naviguant entre ses onglets qu'on ne paie plus.
 *
 * `undefined` dit « société inconnue » (404), et se garde comme une réponse.
 */
@Injectable({ providedIn: 'root' })
export class CompanyDetailStore {
  private readonly api = inject(AdminCompaniesService);
  private readonly writes = inject(CompanyWrites);

  private readonly entries = new Map<string, DetailEntry>();
  private readonly pending = new Map<string, PendingDetail>();
  private tickets = 0;

  /** Le détail, de la copie si elle convient, sinon du serveur. Un échec est relancé. */
  get(id: string): Promise<AdminCompanyDetail | undefined> {
    const version = this.writes.version();
    const entry = this.entries.get(id);
    if (
      entry !== undefined &&
      entry.version === version &&
      Date.now() - entry.readAt <= COMPANY_LIST_MAX_AGE_MS
    ) {
      return Promise.resolve(entry.detail);
    }
    const inFlight = this.pending.get(id);
    if (inFlight !== undefined && inFlight.version === version) {
      return inFlight.promise;
    }
    this.tickets += 1;
    const ticket = this.tickets;
    const promise = this.readFromServer(id, ticket);
    this.pending.set(id, { promise, version, ticket });
    return promise;
  }

  /** Oublie la copie d'un compte : sa prochaine lecture ira au serveur. */
  forget(id: string): void {
    this.entries.delete(id);
    this.pending.delete(id);
  }

  private async readFromServer(
    id: string,
    ticket: number,
  ): Promise<AdminCompanyDetail | undefined> {
    // Le cran de DÉPART : une écriture survenue pendant la lecture la rend
    // déjà périmée, et le lecteur suivant relira.
    const version = this.writes.version();
    try {
      const detail = await this.api.getById(id);
      // Une lecture dépassée (oubliée, ou doublée par une plus récente) rend sa
      // réponse à qui l'attendait, mais n'écrase pas la copie.
      if (this.pending.get(id)?.ticket === ticket) {
        this.entries.set(id, { detail, readAt: Date.now(), version });
      }
      return detail;
    } finally {
      if (this.pending.get(id)?.ticket === ticket) {
        this.pending.delete(id);
      }
    }
  }
}
