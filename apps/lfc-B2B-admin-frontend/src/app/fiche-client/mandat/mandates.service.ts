import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CreatedIdResponse, MandateSectionView, SignMandatePayload } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Accès à la surface **mandat de prélèvement** du back-office.
 *
 * Auth : rien ici, comme pour les autres services admin — le jeton staff est
 * attaché par `staffAuthInterceptor`.
 *
 * **Aucune coordonnée bancaire ne passe par ce service.** L'IBAN va du
 * navigateur directement chez Stripe (iframe), et ce qui remonte au backend
 * n'est qu'un identifiant de moyen de paiement.
 */
@Injectable({ providedIn: 'root' })
export class MandatesService {
  private readonly http = inject(HttpClient);

  /** Le mandat courant + la clé publique Stripe, en une lecture. */
  async section(companyId: string): Promise<MandateSectionView> {
    return firstValueFrom(
      this.http.get<MandateSectionView>(`${B2B_API_BASE}/admin/companies/${companyId}/mandate`),
    );
  }

  /**
   * **Frappe** le mandat : une RUM neuve, un papier à imprimer, rien de signé.
   *
   * Le serveur répond **409** quand un brouillon attend déjà sa signature, et le
   * message nomme sa référence — c'est le comportement utile derrière un double
   * clic, et la raison pour laquelle l'appelant n'a pas à se garder lui-même.
   *
   * Rend l'identifiant et rien d'autre : l'écran relit la section ensuite.
   */
  async mint(companyId: string): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<CreatedIdResponse>(`${B2B_API_BASE}/admin/companies/${companyId}/mandate`, {}),
    );
    return created.id;
  }

  /**
   * Déclare qu'un brouillon est **revenu signé**, et l'active.
   *
   * Vise le mandat par son identifiant : un mandat actif peut être en vigueur
   * pendant qu'on fait signer son remplaçant, et « le mandat de ce client » ne
   * désignerait alors plus rien de précis.
   *
   * `signedAt` est la date du PAPIER (`AAAA-MM-JJ`). Le serveur refuse une date
   * à venir et un mandat qui n'est pas un brouillon.
   */
  async sign(companyId: string, mandateId: string, signedAt: string): Promise<void> {
    const payload: SignMandatePayload = { signedAt };
    await firstValueFrom(
      this.http.put<void>(
        `${B2B_API_BASE}/admin/companies/${companyId}/mandate/${mandateId}/signature`,
        payload,
      ),
    );
  }

  /**
   * Envoie au client **son mandat à signer**, en pièce jointe.
   *
   * ⚠️ Aucun retour arrière : un courriel parti est parti. L'appelant confirme
   * avant, jamais après — l'idempotence du serveur empêche le doublon, pas le
   * regret.
   *
   * Le serveur refuse un mandat non frappé (il porterait le filigrane EXEMPLE)
   * et un mandat déjà signé (un second exemplaire de la même référence
   * circulerait).
   */
  async send(companyId: string, mandateId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${B2B_API_BASE}/admin/companies/${companyId}/mandate/${mandateId}/send`,
        {},
      ),
    );
  }

  /** Dépose (ou remplace) le scan du mandat signé. */
  async uploadProof(companyId: string, file: File): Promise<void> {
    const body = new FormData();
    body.append('file', file);
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/companies/${companyId}/mandate/proof`, body),
    );
  }

  /**
   * La pièce déposée — le mandat papier **signé**, descellé par le serveur.
   *
   * ⚠️ En **blob**, et pas par une URL donnée à un `<a>` : un lien direct part
   * sans le jeton staff — l'intercepteur ne voit que les requêtes `HttpClient` —
   * et le navigateur afficherait une page blanche. C'est la même raison que
   * l'aperçu du mandat.
   *
   * Le serveur répond **404** quand aucune pièce n'est déposée, ce qui est un
   * état normal : le papier met des jours à revenir. L'appelant ne propose donc
   * le geste que sur un mandat qui en porte une.
   *
   * 🔴 Vise le mandat par son identifiant depuis le 2026-09-14 : la route par
   * société rendait la pièce du mandat COURANT, c'est-à-dire de l'actif en
   * rotation bancaire — pas celle du brouillon qu'on s'apprête à activer.
   */
  async proof(companyId: string, mandateId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(
        `${B2B_API_BASE}/admin/companies/${companyId}/mandate/${mandateId}/proof?inline=1`,
        { responseType: 'blob' },
      ),
    );
  }

  /** Retire l'autorisation de prélever. */
  async revoke(companyId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${B2B_API_BASE}/admin/companies/${companyId}/mandate`),
    );
  }
}
