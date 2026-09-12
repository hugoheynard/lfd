import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  AdminOrderRow,
  AdminOrdersQuery,
  AdminPlaceOrderPayload,
  AdminPlacedOrderResponse,
  LineRuleReconstructionView,
  OrderQuotePayload,
  OrderQuoteView,
  OrderView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Les **commandes vues du staff**. Une surface à part de celle du client : ces
 * routes ne demandent pas d'être le client ni membre de la société — ce qu'un
 * commercial n'est ni l'un ni l'autre.
 *
 * Aucun état ici : deux écrans (la liste d'un compte, le détail d'une commande)
 * ne partagent rien et se chargent chacun pour soi.
 */
@Injectable({ providedIn: 'root' })
export class AdminOrdersService {
  private readonly http = inject(HttpClient);

  /** Les commandes, la plus récente en tête. Filtres optionnels. */
  async list(filters: Partial<AdminOrdersQuery> = {}): Promise<readonly AdminOrderRow[]> {
    const params = new URLSearchParams();
    if (filters.companyId !== undefined) {
      params.set('companyId', filters.companyId);
    }
    if (filters.status !== undefined) {
      params.set('status', filters.status);
    }
    if (filters.limit !== undefined) {
      params.set('limit', `${filters.limit}`);
    }
    const query = params.toString();
    return firstValueFrom(
      this.http.get<readonly AdminOrderRow[]>(
        `${B2B_API_BASE}/admin/orders${query === '' ? '' : `?${query}`}`,
      ),
    );
  }

  /** Une commande, dans la même vue que celle du client — délibérément. */
  async byId(id: string): Promise<OrderView> {
    return firstValueFrom(
      this.http.get<OrderView>(`${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}`),
    );
  }

  /**
   * **Ce que la trace figée ne dit pas** — les décisions qui étaient en vigueur
   * le jour de la commande, sur cet article, et dont la ligne ne parle pas.
   *
   * Une route à part, et un appel à part : c'est la lecture d'un tableau daté,
   * on ne la fait qu'au clic.
   */
  async lineRules(id: string, sku: string): Promise<LineRuleReconstructionView> {
    return firstValueFrom(
      this.http.get<LineRuleReconstructionView>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/lines/${encodeURIComponent(sku)}/rules`,
      ),
    );
  }

  /**
   * Le **bon de commande en PDF** — celui du client, pas un exemplaire de bureau.
   *
   * Il n'y a pas de version staff, sur décision explicite : le document qu'on
   * discute au téléphone doit être celui que le client a sous les yeux. Le
   * serveur sert d'ailleurs les MÊMES octets aux deux surfaces, sous la même clé
   * d'archive — si le client l'a déjà téléchargé, c'est sa copie qu'on ouvre.
   *
   * Le PDF vient du serveur et n'est jamais fabriqué ici : c'est lui qui
   * l'archive, donc lui seul peut garantir qu'un avenant ne réécrit pas le
   * papier déjà parti.
   */
  /**
   * **Renvoie au client le courriel de retrait** — le rappel du comptoir.
   *
   * Il vit sur les commandes et non sur la remise : c'est le commerce qui
   * possède le destinataire, le bon et le gabarit. Le serveur REFUSE sur une
   * commande que le fournil n'a pas déclarée prête — un rappel qui ferait venir
   * quelqu'un devant un comptoir vide est pire que pas de rappel du tout.
   */
  async remindHandover(id: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/rappel-retrait`,
        {},
      ),
    );
  }

  async sheetPdf(id: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/bon.pdf`, {
        responseType: 'blob',
      }),
    );
  }

  /**
   * Passe une commande **au nom d'un client**. Aucun prix n'est envoyé : le
   * serveur les ré-résout, et c'est lui qui rend le total et l'éventuel lien de
   * règlement.
   */
  async place(payload: AdminPlaceOrderPayload): Promise<AdminPlacedOrderResponse> {
    return firstValueFrom(
      this.http.post<AdminPlacedOrderResponse>(`${B2B_API_BASE}/admin/orders`, payload),
    );
  }

  /**
   * **Ce que la commande coûtera**, avant de la passer.
   *
   * Le panier affichait le tarif du catalogue pendant que le serveur facturait
   * le prix résolu — mercuriale du client, palier atteint, promotion en cours.
   * Le prix ne peut pas se calculer ici : il dépend du client ET de la quantité,
   * et le recalculer donnerait une seconde règle d'arrondi, donc un écart d'un
   * centime découvert devant le client.
   */
  async quote(payload: OrderQuotePayload): Promise<OrderQuoteView> {
    return firstValueFrom(
      this.http.post<OrderQuoteView>(`${B2B_API_BASE}/admin/orders/quote`, payload),
    );
  }
}
