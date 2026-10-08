import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { InvoiceDossierView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';
import { attachmentFileName } from '../shared/download/content-disposition';
import type { NamedBlob } from './comptabilite-dashboard.service';

/** Les trois feuilles que le serveur exporte, une route chacune. */
export type InvoiceDossierSheet = 'invoice' | 'orders' | 'gaps';

const BASE = `${B2B_API_BASE}/admin/accounting/invoice-dossiers`;

/**
 * Le **dossier de facturation simulé** d'un payeur pour un cycle (plan
 * `documentation/comptabilite/facturation/simulateur-dossier-de-facturation.md`).
 *
 * Tout est CALCULÉ PAR LE SERVEUR : la facture en une fois, la ventilation,
 * les écarts. L'écran ne refait aucune somme — un centime recalculé ici serait
 * un troisième chiffre, ni celui de la facture, ni celui des bons.
 */
@Injectable({ providedIn: 'root' })
export class InvoiceDossierService {
  private readonly http = inject(HttpClient);

  async dossier(companyId: string, month: string): Promise<InvoiceDossierView> {
    return firstValueFrom(
      this.http.get<InvoiceDossierView>(`${BASE}/companies/${encodeURIComponent(companyId)}`, {
        params: { month },
      }),
    );
  }

  /** En blob et non en texte : le corps porte un BOM, qu'une chaîne collerait au fichier. */
  async exportCsv(
    companyId: string,
    month: string,
    sheet: InvoiceDossierSheet,
  ): Promise<NamedBlob> {
    const response = await firstValueFrom(
      this.http.get(`${BASE}/companies/${encodeURIComponent(companyId)}/${sheet}.csv`, {
        params: { month },
        responseType: 'blob',
        observe: 'response',
      }),
    );
    if (response.body === null) {
      throw new Error('Le fichier du dossier est arrivé sans contenu.');
    }
    return {
      blob: response.body,
      fileName: attachmentFileName(response.headers.get('Content-Disposition')),
    };
  }
}
