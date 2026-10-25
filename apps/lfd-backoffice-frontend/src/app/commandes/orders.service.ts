import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  ActivityEventView,
  OrderSalesTermsResponse,
  AdminOrdersPage,
  AdminOrdersQuery,
  AdminPlaceOrderPayload,
  AdminPlacedOrderResponse,
  LineRuleReconstructionView,
  OrderHandoverProofResponse,
  OrderQuotePayload,
  OrderQuoteView,
  AdminOrderView,
  AdminCancelOrderPayload,
  AdminShortfallDecisionPayload,
  OrderRevisedResponse,
  OrderRevisionEntryView,
  OrderRevisionPayload,
  OrderRevisionQuotePayload,
  OrderRevisionQuoteView,
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

  /**
   * Une page de commandes, la plus récente en tête. Filtres optionnels ;
   * `page` pour une page numérotée (avec `total`), ou `nextCursor` renvoyé en
   * `cursor` pour la suivante.
   */
  async list(filters: Partial<AdminOrdersQuery> = {}): Promise<AdminOrdersPage> {
    const params = new URLSearchParams();
    // `withSubAccounts` n'a de sens qu'à vrai ; les autres passent tels quels.
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === false) {
        continue;
      }
      params.set(key, `${value}`);
    }
    const query = params.toString();
    return firstValueFrom(
      this.http.get<AdminOrdersPage>(
        `${B2B_API_BASE}/admin/orders${query === '' ? '' : `?${query}`}`,
      ),
    );
  }

  /** Une commande, dans la même vue que celle du client — délibérément. */
  async byId(id: string): Promise<AdminOrderView> {
    return firstValueFrom(
      this.http.get<AdminOrderView>(`${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}`),
    );
  }

  /**
   * **L'historique d'une commande** — les faits du journal qui la touchent, le
   * plus récent d'abord, bornés côté serveur (plan `page-commandes.md` §3 bis).
   */
  /**
   * Les CGV que la commande porte — texte, révision, PDF en vigueur à sa
   * passation (plan `legal/plan-cgv-par-audience.md`, C4). `salesTerms: null`
   * pour une commande d'avant l'enregistrement.
   */
  async salesTerms(id: string): Promise<OrderSalesTermsResponse> {
    return firstValueFrom(
      this.http.get<OrderSalesTermsResponse>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/sales-terms`,
      ),
    );
  }

  /**
   * **Les versions précédentes** (plan `plan-modifier-une-commande.md`, §6) :
   * chaque modification, la plus récente en tête, avec la composition qu'elle
   * a remplacée.
   */
  async revisions(id: string): Promise<readonly OrderRevisionEntryView[]> {
    return firstValueFrom(
      this.http.get<OrderRevisionEntryView[]>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/revisions`,
      ),
    );
  }

  async history(id: string): Promise<readonly ActivityEventView[]> {
    return firstValueFrom(
      this.http.get<ActivityEventView[]>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/history`,
      ),
    );
  }

  /**
   * **La preuve de livraison** d'une commande remise ou déposée à la porte —
   * `proof: null` quand il n'y en a pas. Aucune clé d'image ne traverse.
   */
  async handoverProof(id: string): Promise<OrderHandoverProofResponse> {
    return firstValueFrom(
      this.http.get<OrderHandoverProofResponse>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/delivery-proof`,
      ),
    );
  }

  /**
   * Une image de cette preuve, en blob : la route porte le jeton, qu'un
   * `<img src>` n'enverrait pas. Désignée par la commande, jamais par une clé.
   */
  async handoverProofImage(id: string, piece: 'photo' | 'signature'): Promise<Blob> {
    return firstValueFrom(
      this.http.get(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/delivery-proof/${piece}`,
        { responseType: 'blob' },
      ),
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
   * Il vit sur les commandes et non sur le retrait : c'est le commerce qui
   * possède le destinataire, le bon et le gabarit. Le serveur REFUSE sur une
   * commande que le fournil n'a pas déclarée prête — un rappel qui ferait venir
   * quelqu'un devant un comptoir vide est pire que pas de rappel du tout.
   */
  async remindHandover(id: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/pickup-reminder`,
        {},
      ),
    );
  }

  /**
   * **Annule la commande**, motif à l'appui (doc
   * `annulation-par-le-staff.md`, C3.8). `204` sans corps : l'écran relit
   * le détail. Les refus (`409 orders.cancel.*`) remontent tels quels — leur
   * message est la phrase à montrer.
   */
  /**
   * **« Décider du départ »** d'une commande dont le colisage a signalé un
   * manque (plan E6, E6b) — ce qui est au bac part, le reste est abandonné.
   * `204` : l'écran relit le détail. Les refus (`409`) portent leur phrase.
   */
  async decideShortfall(id: string, payload: AdminShortfallDecisionPayload): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/shortfall-decision`,
        payload,
      ),
    );
  }

  async cancel(id: string, payload: AdminCancelOrderPayload): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/cancel`,
        payload,
      ),
    );
  }

  /**
   * **« Relancer le remboursement »** d'une commande annulée (doc
   * `annulation-par-le-staff.md`, C4.9). `202` : le serveur n'attend pas
   * Stripe — l'écran relit le détail. Les refus (`404`, `409
   * orders.refund_request.*`) portent leur phrase.
   */
  async retryRefund(id: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/refund/retry`,
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

  /**
   * **Le devis d'une modification** (plan `plan-modifier-une-commande.md`,
   * M1) : la commande telle qu'elle serait, l'écart avec la révision
   * courante, et le numéro de révision à renvoyer tel quel à la validation.
   * Les refus (`409 orders.revise.*`) portent leur phrase.
   */
  async quoteRevision(
    id: string,
    payload: OrderRevisionQuotePayload,
  ): Promise<OrderRevisionQuoteView> {
    return firstValueFrom(
      this.http.post<OrderRevisionQuoteView>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/revisions/quote`,
        payload,
      ),
    );
  }

  /**
   * **Modifie la commande.** `expectedRevision` est celle du devis : si la
   * commande a bougé entre-temps, le serveur refuse (`409
   * orders.revise.stale_revision`) plutôt que d'écraser. L'écran relit ensuite.
   */
  async revise(id: string, payload: OrderRevisionPayload): Promise<OrderRevisedResponse> {
    return firstValueFrom(
      this.http.post<OrderRevisedResponse>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/revisions`,
        payload,
      ),
    );
  }
}
