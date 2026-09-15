import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  BillingCycleView,
  CatalogSummaryView,
  CustomerPortfolioView,
  SepaScheme,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';
import { attachmentFileName } from '../shared/download/content-disposition';

/** Un fichier rendu, et le nom que le serveur lui donne — `null` s'il n'en dit rien. */
export interface NamedBlob {
  readonly blob: Blob;
  readonly fileName: string | null;
}

/**
 * Ce que le tableau de bord de la comptabilité lit — et les deux fichiers qu'il
 * rend.
 *
 * Un service à lui plutôt que deux appels ajoutés aux services existants
 * (`AdminCompaniesService`, `CatalogueService`) : ces deux-là sont des services
 * d'ÉCRAN, ils portent aussi les écritures de leur page. Le tableau de bord ne
 * fait que lire, et lire chez deux voisins ; l'accrocher à l'un des deux
 * l'aurait rangé sous le mauvais sujet.
 *
 * Deux appels, pas un. Le serveur pourrait composer les deux synthèses en une
 * réponse, et il ne le fait pas : elles appartiennent à deux contextes murés par
 * deux droits différents, et une route unique devrait choisir lequel exiger. Le
 * front compose, chaque mur reste le sien — et deux requêtes pour un tableau de
 * bord ne sont pas un facteur, ce sont deux requêtes.
 */
@Injectable({ providedIn: 'root' })
export class ComptabiliteDashboardService {
  private readonly http = inject(HttpClient);

  async customers(): Promise<CustomerPortfolioView> {
    return firstValueFrom(
      this.http.get<CustomerPortfolioView>(`${B2B_API_BASE}/admin/companies/portfolio`),
    );
  }

  async catalog(): Promise<CatalogSummaryView> {
    return firstValueFrom(
      this.http.get<CatalogSummaryView>(`${B2B_API_BASE}/admin/catalog/summary`),
    );
  }

  /**
   * Le cycle de prélèvement en cours — **deux instants**, et rien d'autre.
   *
   * Ni progression, ni jours restants, ni montant : le premier couple est un
   * calcul de présentation que l'écran refait avec son horloge (`CycleBar`), et
   * le montant n'existe pas au niveau du cycle — il se reconstitue par tentative
   * de prélèvement.
   *
   * Une troisième lecture pour le tableau de bord, et elle ne rejoint pas les
   * deux autres dans un `Promise.all` : une panne du cycle ne doit pas emporter
   * le portefeuille et le catalogue, qui n'en dépendent pas.
   */
  async billingCycle(): Promise<BillingCycleView> {
    return firstValueFrom(
      this.http.get<BillingCycleView>(`${B2B_API_BASE}/admin/accounting/billing-cycle/current`),
    );
  }

  /**
   * Les exports, en **blob** et non par un lien.
   *
   * `responseType: 'blob'` et pas `'text'` : le corps porte un BOM UTF-8, et le
   * faire transiter par une chaîne JavaScript le collerait au premier caractère
   * du fichier enregistré — visible dans le tableur, sous la forme d'un
   * « ï»¿Référence » en tête de la première colonne.
   */
  async customersCsv(): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${B2B_API_BASE}/admin/companies/export.csv`, { responseType: 'blob' }),
    );
  }

  async catalogCsv(): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${B2B_API_BASE}/admin/catalog/export.csv`, { responseType: 'blob' }),
    );
  }

  /**
   * Le **brouillon** de fichier de prélèvement du cycle en cours, pour UN
   * schéma : un fichier par schéma, chacun avec son `LclInstrm`
   * (`plan-mandat-deux-schemas.md` §10.2).
   *
   * `responseType: 'blob'` : c'est un fichier, pas un objet. Et il part avec son
   * avertissement dans son nom comme dans son corps — l'écran n'a pas à le
   * rajouter. `observe: 'response'` pour lire ce nom dans `Content-Disposition`.
   *
   * `scheme` toujours envoyé : la route sans paramètre est dépréciée, et rend le
   * B2B d'hier en silence.
   */
  async cycleDraft(legalEntityId: string, scheme: SepaScheme): Promise<NamedBlob> {
    return this.namedFile('draft.xml', legalEntityId, scheme);
  }

  /**
   * Le **contrôle** du brouillon, en CSV.
   *
   * Une seconde requête, et non un champ de la première : le serveur relit le
   * XML pour le produire, et le fabriquer à chaque téléchargement de XML
   * coûterait un travail que personne n'a demandé. Par schéma, comme le XML
   * qu'il relit.
   */
  async cycleDraftAudit(legalEntityId: string, scheme: SepaScheme): Promise<NamedBlob> {
    return this.namedFile('draft-audit.csv', legalEntityId, scheme);
  }

  /**
   * Un fichier du cycle, et le nom que le serveur lui donne.
   *
   * La route sans `scheme` est dépréciée et rend le B2B d'hier : le paramètre
   * part donc toujours, pour qu'aucun fichier ne change de contenu en silence
   * le jour où elle disparaît.
   */
  private async namedFile(
    file: 'draft.xml' | 'draft-audit.csv',
    legalEntityId: string,
    scheme: SepaScheme,
  ): Promise<NamedBlob> {
    const response = await firstValueFrom(
      this.http.get(`${B2B_API_BASE}/admin/accounting/billing-cycle/${file}`, {
        params: { legalEntityId, scheme },
        responseType: 'blob',
        observe: 'response',
      }),
    );
    if (response.body === null) {
      // Enregistrer un fichier vide ferait croire à un lot sans ligne.
      throw new Error('Le fichier est arrivé sans contenu.');
    }
    return {
      blob: response.body,
      fileName: attachmentFileName(response.headers.get('Content-Disposition')),
    };
  }
}
