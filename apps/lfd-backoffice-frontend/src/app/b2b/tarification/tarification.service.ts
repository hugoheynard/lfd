import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CreatePriceRulePayload,
  CreatedIdResponse,
  PriceProjectionPayload,
  PriceProjectionView,
  PriceRuleView,
  PricingBoardView,
  PricingComparisonView,
  PricingJournalPageView,
  SetVolumeLadderPayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Le **paramétrage tarifaire** : ce qui altère un prix.
 *
 * Les limites — ce qui l'empêche de descendre trop bas — n'y sont plus : elles
 * relèvent de `lfc_price_limits` et vivent dans `PriceLimitsService`
 * (`comptabilite/`). Le tableau les porte encore, en lecture.
 *
 * Écriture par geste nommé, comme côté serveur. Aucune arithmétique ici : le
 * tableau arrive avec ses prix **déjà résolus** par la fonction qui facture. Un
 * recalcul côté navigateur finirait par annoncer autre chose que la facture, et
 * c'est exactement ce qu'un client conteste.
 */
@Injectable({ providedIn: 'root' })
export class TarificationService {
  private readonly http = inject(HttpClient);

  /**
   * Le tableau complet — familles, articles, règles, limites, prix résolus.
   *
   * `at` le rend **tel qu'il était** : les décisions en vigueur ce jour-là, avec
   * les règles archivées depuis. Pas le prix facturé — le tarif de liste n'est
   * pas historisé, et l'écran l'écrit.
   */
  read(at?: string): Promise<PricingBoardView> {
    const query = at === undefined ? '' : `?at=${encodeURIComponent(at)}`;
    return firstValueFrom(this.http.get<PricingBoardView>(`${B2B_API_BASE}/admin/pricing${query}`));
  }

  /**
   * **Deux marqueurs**, et ce qui a bougé entre eux : le prix par article, et le
   * volume vendu contre la fenêtre miroir d'avant.
   *
   * Un seul appel et non deux lectures datées recollées ici : le volume se
   * mesure sur la fenêtre QUI SÉPARE les marqueurs, et cette fenêtre n'existe
   * dans aucune des deux lectures.
   */
  compare(from: string, to: string): Promise<PricingComparisonView> {
    const query = new URLSearchParams({ from, to }).toString();
    return firstValueFrom(
      this.http.get<PricingComparisonView>(`${B2B_API_BASE}/admin/pricing/comparison?${query}`),
    );
  }

  /**
   * **Ce qu'on a rangé** — les règles archivées, de la plus récente à la plus
   * ancienne.
   *
   * Une lecture à part et non un champ du tableau : « qu'est-ce qui
   * s'applique ? » et « qu'a-t-on retiré ? » sont deux questions, et la seconde
   * se pose trois fois par an.
   */
  archivedRules(): Promise<PriceRuleView[]> {
    return firstValueFrom(
      this.http.get<PriceRuleView[]>(`${B2B_API_BASE}/admin/pricing/rules/archived`),
    );
  }

  /**
   * **Pose un barème de volume** — l'échelle entière, d'un coup.
   *
   * `PUT` et non `POST` sur des paliers : ils forment UNE décision et se
   * remplacent ensemble. Poser palier par palier laisserait, entre deux appels,
   * un barème qui régresse.
   */
  async setVolumeLadder(payload: SetVolumeLadderPayload): Promise<string> {
    const created = await firstValueFrom(
      this.http.put<CreatedIdResponse>(`${B2B_API_BASE}/admin/pricing/volume-ladders`, payload),
    );
    return created.id;
  }

  /** Pose une règle. Rend son identifiant, pour pouvoir la retirer. */
  async createRule(payload: CreatePriceRulePayload): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<CreatedIdResponse>(`${B2B_API_BASE}/admin/pricing/rules`, payload),
    );
    return created.id;
  }

  /**
   * **Suspend** une promotion : elle cesse d'agir et garde sa place.
   *
   * Sa fenêtre n'est pas touchée — une promo « du 1er au 31 » suspendue trois
   * jours ne se prolonge pas de trois jours. Elle les a perdus, ce qui est ce
   * qui s'est passé.
   */
  async pauseRule(id: string, reason: string | null): Promise<void> {
    await this.act(id, 'pause', reason);
  }

  /** **Reprend** : la règle réagit à partir de maintenant. */
  async resumeRule(id: string): Promise<void> {
    await this.act(id, 'resume', null);
  }

  /**
   * **Archive** — le seul geste qui retire une règle du tableau.
   *
   * Rien ne s'efface : une règle a facturé, elle a fait un prix, et l'effacer
   * effacerait l'explication d'une facture qui, elle, reste.
   */
  async archiveRule(id: string, reason: string | null): Promise<void> {
    await this.act(id, 'archive', reason);
  }

  /**
   * Une page de ce qui est arrivé à cette règle ou à cette limite, du plus
   * récent au plus ancien.
   *
   * `asOf` absent ouvre un instantané neuf, dont la réponse rend l'ancre ; la
   * renvoyer pour les pages suivantes les fait lire le même instantané.
   */
  journalPage(
    subjectType: 'rule' | 'floor',
    subjectId: string,
    request: { readonly page: number; readonly pageSize: number; readonly asOf?: string },
  ): Promise<PricingJournalPageView> {
    let params = new HttpParams().set('page', request.page).set('pageSize', request.pageSize);
    if (request.asOf !== undefined) {
      params = params.set('asOf', request.asOf);
    }
    return firstValueFrom(
      this.http.get<PricingJournalPageView>(
        `${B2B_API_BASE}/admin/pricing/journal/${subjectType}/${encodeURIComponent(subjectId)}/pages`,
        { params },
      ),
    );
  }

  private async act(id: string, verb: string, reason: string | null): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${B2B_API_BASE}/admin/pricing/rules/${encodeURIComponent(id)}/${verb}`,
        { reason },
      ),
    );
  }

  /**
   * **Ce que l'article coûterait à des niveaux de cumul qui n'existent pas.**
   *
   * Le devis temporel repose entièrement là-dessus : chaque point est une
   * résolution serveur, pas une règle de palier rejouée dans le navigateur.
   */
  async project(payload: PriceProjectionPayload): Promise<PriceProjectionView> {
    return firstValueFrom(
      this.http.post<PriceProjectionView>(`${B2B_API_BASE}/admin/pricing/projection`, payload),
    );
  }
}
