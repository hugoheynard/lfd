import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CompanyBankAccountSectionView,
  SetCompanyBankAccountPayload,
  SetMandateOptionsPayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Accès au **RIB d'une société cliente** — le compte que nous débitons.
 *
 * Auth : rien ici, le jeton staff est attaché par `staffAuthInterceptor`.
 *
 * 🔴 **L'IBAN ne circule que dans un sens.** Il monte à l'enregistrement, et ne
 * redescend jamais : la lecture n'en rend que les quatre derniers caractères.
 * C'est pourquoi le champ IBAN du formulaire repart toujours vide, même quand un
 * compte existe — il n'y a rien à y remettre.
 *
 * Service distinct de `MandatesService`, comme les deux routes le sont : un RIB
 * est une coordonnée qu'on recopie, un mandat est une autorisation qu'on
 * obtient. Les réunir ferait le service où l'on pose la troisième chose.
 */
@Injectable({ providedIn: 'root' })
export class BankAccountService {
  private readonly http = inject(HttpClient);

  /** Le RIB du client, ou `null` s'il n'en a jamais déposé. */
  async read(companyId: string): Promise<CompanyBankAccountSectionView> {
    return firstValueFrom(
      this.http.get<CompanyBankAccountSectionView>(
        `${B2B_API_BASE}/admin/companies/${companyId}/bank-account`,
      ),
    );
  }

  /** Recopie le RIB — titulaire, adresse, IBAN, BIC, en un seul geste. */
  async save(companyId: string, payload: SetCompanyBankAccountPayload): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/companies/${companyId}/bank-account`, payload),
    );
  }

  /**
   * Réécrit les **zones facultatives** du mandat — 14, 19 et 20.
   *
   * Route à part du RIB, et pas par commodité : le `PUT` du RIB exige l'IBAN,
   * qui ne redescend jamais. Passer par lui pour corriger une description de
   * contrat obligerait à ressaisir un IBAN à chaque fois.
   */
  async saveOptions(companyId: string, payload: SetMandateOptionsPayload): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/companies/${companyId}/mandate-options`, payload),
    );
  }

  /**
   * L'aperçu du mandat, en mémoire.
   *
   * ⚠️ En **blob**, et pas par une URL donnée à une `<iframe>` : un lien direct
   * part sans le jeton staff — l'intercepteur ne voit que les requêtes
   * `HttpClient` — et rendrait un 401 que le navigateur affiche en page
   * blanche. C'est la même raison que `saveBlob`.
   */
  async preview(companyId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${B2B_API_BASE}/admin/companies/${companyId}/mandate/preview.pdf?inline=1`, {
        responseType: 'blob',
      }),
    );
  }
}
