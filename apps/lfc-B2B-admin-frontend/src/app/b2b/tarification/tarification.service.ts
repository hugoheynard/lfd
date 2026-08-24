import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CreatePriceRulePayload,
  PriceProjectionPayload,
  PriceProjectionView,
  PriceRuleView,
  PriceScopePayload,
  PricingBoardView,
  PricingComparisonView,
  PricingJournalEntryView,
  SetPriceFloorPayload,
  SetVolumeLadderPayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Le **paramétrage tarifaire** : ce qui altère un prix, et ce qui l'empêche de
 * descendre trop bas.
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
      this.http.put<{ id: string }>(`${B2B_API_BASE}/admin/pricing/volume-ladders`, payload),
    );
    return created.id;
  }

  /** Pose une règle. Rend son identifiant, pour pouvoir la retirer. */
  async createRule(payload: CreatePriceRulePayload): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<{ id: string }>(`${B2B_API_BASE}/admin/pricing/rules`, payload),
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

  /** Ce qui est arrivé à cette règle ou à cette limite, du plus récent au plus ancien. */
  journalFor(subjectType: 'rule' | 'floor', subjectId: string): Promise<PricingJournalEntryView[]> {
    return firstValueFrom(
      this.http.get<PricingJournalEntryView[]>(
        `${B2B_API_BASE}/admin/pricing/journal/${subjectType}/${encodeURIComponent(subjectId)}`,
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

  /** Pose la limite. **Idempotent par portée** : re-poser remplace. */
  async setFloor(payload: SetPriceFloorPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${B2B_API_BASE}/admin/pricing/floors`, payload));
  }

  /**
   * **Confirme** une limite sans la changer : l'intention est maintenue, sa
   * référence et sa date repartent d'aujourd'hui.
   *
   * Un geste à part, pas un `PUT` déguisé. Sans lui, la seule façon d'éteindre
   * le signal de dérive serait de MODIFIER la limite — donc de changer une
   * décision pour faire taire un rappel.
   */
  async confirmFloor(scope: PriceScopePayload): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${B2B_API_BASE}/admin/pricing/floors/${floorPath(scope)}/confirm`, {}),
    );
  }

  /**
   * **Archive** la limite d'une portée, avec le motif écrit à l'écran.
   *
   * `POST` et non `DELETE` : un `DELETE` ne porte pas de corps de façon fiable à
   * travers les intermédiaires HTTP, et le motif est précisément ce qu'on veut
   * garder. Le serveur conserve son `DELETE` sans motif — aucun écran ne l'appelle
   * plus, et un client qui n'a rien à dire s'en sert encore.
   */
  async archiveFloor(scope: PriceScopePayload, reason: string | null): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${B2B_API_BASE}/admin/pricing/floors/${floorPath(scope)}/archive`, {
        reason,
      }),
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

/**
 * Le chemin d'une limite.
 *
 * La portée globale ne désigne aucune cible, donc le sien n'en porte pas — un
 * segment vide ne s'apparie pas côté serveur.
 */
function floorPath(scope: PriceScopePayload): string {
  return scope.id === null ? 'global' : `${scope.type}/${encodeURIComponent(scope.id)}`;
}
