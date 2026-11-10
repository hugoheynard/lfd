import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';

import type {
  AdminOrderEstimateView,
  ActivityEventView,
  OrderSalesTermsResponse,
  AdminOrdersPage,
  AdminOrdersQuery,
  AdminOrderEstimatePayload,
  AdminPlaceOrderPayload,
  AdminPlacedOrderResponse,
  LineRuleReconstructionView,
  OrderHandoverProofResponse,
  OrderMailsView,
  OrderQuotePayload,
  OrderQuoteView,
  AdminOrderView,
  AdminCancelOrderPayload,
  AdminShortfallDecisionPayload,
  AdminShortfallLetterDraft,
  AdminShortfallLetterPayload,
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
   * **Les versions précédentes** (voir `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification ») :
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
   * **Les e-mails d'une commande** (`le-sujet-des-e-mails.md`, règle 7) :
   * ce que le suivi dit de chacun, les plus récents d'abord, sans adresse.
   */
  async mails(id: string): Promise<OrderMailsView> {
    return firstValueFrom(
      this.http.get<OrderMailsView>(`${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/mails`),
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
   * **« Rappel au client »** — le courriel de retrait renvoyé à qui n'est pas
   * venu, depuis la Supervision.
   *
   * Il vit sur les commandes et non sur le retrait : c'est le commerce qui
   * possède le destinataire, le bon et le gabarit. Le serveur REFUSE (409,
   * phrase à montrer) sur une commande pas prête, avant le délai réglé après
   * la fin du créneau, et au second envoi : il ne part qu'une fois.
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
   * **« Avertir le client »** — « Votre commande prend du retard », depuis la
   * Supervision, quand la fin du créneau est passée et que la commande n'est
   * pas prête. Mêmes refus que le rappel, son propre délai ; une fois par
   * commande.
   */
  async warnOfDelay(id: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/delay-warning`,
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

  /** La proposition « Écrire au client » (E6d) : le texte pré-rempli, à relire. */
  async shortfallLetterDraft(id: string): Promise<AdminShortfallLetterDraft> {
    return firstValueFrom(
      this.http.get<AdminShortfallLetterDraft>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/shortfall-letter`,
      ),
    );
  }

  /** « Écrire au client » (E6d) : envoie le texte RELU, une fois par décision. */
  async writeShortfallLetter(id: string, payload: AdminShortfallLetterPayload): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/shortfall-letter`,
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
   * **« Relancer »** une demande de remboursement par carte (plan
   * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
   * §3.4, §5.3) — PAR DEMANDE : une commande en porte une par paiement
   * encaissé. `202` : le serveur n'attend pas Stripe, l'écran relit le détail.
   * Les refus (`404`, `409`) portent leur phrase.
   */
  async retryRefund(requestId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${B2B_API_BASE}/admin/card-payments/refund-requests/${encodeURIComponent(requestId)}/retry`,
        {},
      ),
    );
  }

  /**
   * **« Rendu autrement »** (plan M2, §5.5) : une demande arrêtée est notée
   * remboursée hors de la plateforme, avec le motif de l'équipe. Les refus
   * (`400` motif, `404`, `409` pas arrêtée ou plus rien à rendre) portent leur
   * phrase.
   */
  async settleRefundElsewhere(requestId: string, reason: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${B2B_API_BASE}/admin/card-payments/refund-requests/${encodeURIComponent(requestId)}/settle-elsewhere`,
        { reason },
      ),
    );
  }

  /**
   * **« Abandonner »** le complément qui attend son paiement (plan
   * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.5) :
   * `204` ; `409` s'il n'y a rien à abandonner ou s'il vient d'être payé.
   */
  async abandonCardIncrease(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/complement`),
    );
  }

  /** **« Relancer »** une modification payée et bloquée (plan S2, §2.6) : `204`, ou `409`. */
  async relaunchCardIncrease(id: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}/card-increase/relaunch`,
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
   * **Ce que la saisie coûterait, au centime** (plan
   * `documentation/pricing/saisie/plan-prix-de-la-saisie.md`, lot P2) : le
   * serveur compose la commande que `place` passerait, avec le même corps, et
   * ne l'écrit pas.
   *
   * Un `Observable` et non une promesse, contrairement aux voisines : la
   * saisie **annule** la requête en vol quand elle change, et seul un
   * désabonnement interrompt l'appel HTTP.
   */
  estimate(payload: AdminOrderEstimatePayload): Observable<AdminOrderEstimateView> {
    return this.http.post<AdminOrderEstimateView>(`${B2B_API_BASE}/admin/orders/estimate`, payload);
  }

  /**
   * **Le devis d'une modification** (voir `documentation/commandes/modification/modifier-une-commande.md`,
   * § 2.2 « Le chemin d'une modification ») : la commande telle qu'elle serait, l'écart avec la révision
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
