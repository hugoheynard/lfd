import { computed, inject, Injectable, signal } from '@angular/core';
import type { MyLoyaltyVoucherView } from '@lfd/contracts';

import { AuthFacade } from '../../auth/auth.facade';
import { ClientLoyalty } from '../client-loyalty.service';
import { ClientWorkspace } from '../client-workspace.service';

/**
 * Le préfixe des refus d'un bon de fidélité — expiré, déjà utilisé, disputé
 * par un autre onglet. Le préfixe plutôt que la liste : les codes vivent dans
 * `apps/lfd-api/src/b2b/loyalty/domain/errors/loyalty-errors.ts`, et les
 * recopier un à un en ferait une liste qui dérive.
 */
export const LOYALTY_REFUSAL_PREFIX = 'loyalty.';

/**
 * **Le bon de fidélité choisi pour la commande en cours** — un seul, ou aucun
 * (plan des points, §13, E2.2).
 *
 * Il ne décide d'aucun montant : il porte un identifiant que le devis et la
 * passation envoient (`voucherId`), et le serveur impute. Le partager entre le
 * décompte et la passation est tout son objet — un bon affiché au panier et
 * absent de la commande serait un prix annoncé qu'on ne facture pas.
 *
 * **Le choix n'existe qu'en espace personnel.** Il reste gardé (un retour au
 * perso le retrouve s'il est encore disponible), mais {@link effective} est
 * `null` dès qu'on bascule vers une société, sans attendre un devis : rien de
 * la fidélité ne paraît en pro (Hugo, 2026-09-27).
 */
@Injectable({ providedIn: 'root' })
export class VoucherChoice {
  private readonly auth = inject(AuthFacade);
  private readonly loyalty = inject(ClientLoyalty);
  private readonly workspace = inject(ClientWorkspace);

  private readonly picked = signal<string | null>(null);

  /**
   * Les bons proposables : particulier connecté, espace personnel, programme
   * ouvert, statut `available`. Vide sinon — et le choix ne s'affiche pas.
   */
  readonly available = computed<readonly MyLoyaltyVoucherView[]>(() => {
    const view = this.loyalty.view();
    if (!this.auth.isAuthenticated() || !this.workspace.isPersonal() || view?.open !== true) {
      return [];
    }
    return view.vouchers.filter((voucher) => voucher.status === 'available');
  });

  /**
   * Le bon qui part réellement, ou `null`. Un bon choisi qui n'est plus
   * disponible (relu utilisé, expiré) cesse d'être envoyé de lui-même.
   */
  readonly effective = computed<MyLoyaltyVoucherView | null>(
    () => this.available().find((voucher) => voucher.id === this.picked()) ?? null,
  );

  /** L'identifiant du bon choisi, `null` = aucun. */
  readonly selected = computed(() => this.effective()?.id ?? null);

  select(voucherId: string | null): void {
    this.picked.set(voucherId);
  }

  /**
   * Remet le choix à « aucun » et relit les bons : après une passation qui a
   * consommé le bon, ou un refus qui le dit indisponible.
   */
  async release(): Promise<void> {
    this.picked.set(null);
    await this.loyalty.load();
  }
}
