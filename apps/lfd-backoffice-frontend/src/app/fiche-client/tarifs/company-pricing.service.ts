import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AffectedRulesResponse,
  CloseCompanyMercurialePayload,
  CompanyPricingView,
  MercurialeDraftResponse,
  MercurialeDraftView,
  PoseCompanyMercurialePayload,
  RenameCompanyMercurialePayload,
  SaveMercurialeDraftPayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **La tarification d'un compte** — ce qu'il paie, et ce qu'on lui pose.
 *
 * Les trois appels visent la surface `b2b_pricing` et non `b2b_companies` : la
 * fiche s'ouvre avec le second, que portent aussi la comptabilité et le
 * support, et brancher les prix négociés dessus les leur donnerait. L'onglet est
 * donc caché à qui n'a pas le droit de la tarification — personne ne gagne un
 * accès, personne n'en perd.
 */
@Injectable({ providedIn: 'root' })
export class CompanyPricingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/pricing/companies`;

  private path(companyId: string, suffix = ''): string {
    return `${this.base}/${encodeURIComponent(companyId)}${suffix}`;
  }

  /** Ce que ce client paie **aujourd'hui**, et ses mercuriales. */
  async read(companyId: string): Promise<CompanyPricingView> {
    return firstValueFrom(this.http.get<CompanyPricingView>(this.path(companyId)));
  }

  /** Rend le nombre de règles écrites — une ligne, une règle. */
  async pose(
    companyId: string,
    payload: PoseCompanyMercurialePayload,
  ): Promise<AffectedRulesResponse> {
    return firstValueFrom(
      this.http.post<AffectedRulesResponse>(this.path(companyId, '/mercuriale'), payload),
    );
  }

  /**
   * Clore une mercuriale en cours. `POST` et non `DELETE` : rien n'est supprimé,
   * ses règles sont archivées et une lecture datée d'avant les retrouve.
   */
  async close(
    companyId: string,
    payload: CloseCompanyMercurialePayload,
  ): Promise<AffectedRulesResponse> {
    return firstValueFrom(
      this.http.post<AffectedRulesResponse>(this.path(companyId, '/mercuriale/close'), payload),
    );
  }

  /**
   * **Renommer une mercuriale.**
   *
   * Le geste a l'air anodin et ne l'est pas : faute d'identité en base, le
   * libellé est la moitié de la clé qui recolle ses règles. Le serveur les
   * renomme toutes d'un coup, et refuse un nom déjà pris sur la même fenêtre —
   * les deux mercuriales se confondraient à la lecture suivante.
   */
  async rename(
    companyId: string,
    payload: RenameCompanyMercurialePayload,
  ): Promise<AffectedRulesResponse> {
    return firstValueFrom(
      this.http.post<AffectedRulesResponse>(this.path(companyId, '/mercuriale/rename'), payload),
    );
  }

  /**
   * **Le brouillon en cours**, ou `null`.
   *
   * La réponse est enveloppée : un `null` nu part en corps vide, et « pas de
   * brouillon » cesserait de se distinguer de « pas de corps ».
   */
  async draft(companyId: string): Promise<MercurialeDraftView | null> {
    const body = await firstValueFrom(
      this.http.get<MercurialeDraftResponse>(this.path(companyId, '/mercuriale/draft')),
    );
    return body.draft;
  }

  /** Enregistre — un brouillon par compte, et il se remplace entier. */
  async saveDraft(companyId: string, payload: SaveMercurialeDraftPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(this.path(companyId, '/mercuriale/draft'), payload));
  }

  /** Jette le brouillon. Silencieux s'il n'y en a pas : l'état visé est atteint. */
  async discardDraft(companyId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(this.path(companyId, '/mercuriale/draft')));
  }
}
