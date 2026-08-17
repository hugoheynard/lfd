import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CreatePriceRulePayload,
  PriceScopePayload,
  PricingBoardView,
  PricingJournalEntryView,
  SetPriceFloorPayload,
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

  /** Le tableau complet — familles, articles, règles, limites, prix résolus. */
  read(): Promise<PricingBoardView> {
    return firstValueFrom(this.http.get<PricingBoardView>(`${B2B_API_BASE}/admin/pricing`));
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
   * Retire la limite d'une portée.
   *
   * La portée globale a son propre chemin : elle ne désigne aucune cible, donc
   * le sien n'en porte pas — un segment vide ne s'apparie pas côté serveur.
   */
  async removeFloor(scope: PriceScopePayload): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${B2B_API_BASE}/admin/pricing/floors/${floorPath(scope)}`),
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
