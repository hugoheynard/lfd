import { InjectionToken, type Injector } from '@angular/core';
import type {
  AccountView,
  MyLoyaltyView,
  PlacedOrderResponse,
  PublicOrderOpeningView,
} from '@lfd/contracts';
import type { ShopCopyPreviewJourney } from '@lfd/contracts/shop-copy-preview';

/**
 * **Le monde d'un parcours** — ce que le backend de démonstration et la façade
 * d'authentification servent, fixé avant le premier dessin (plan
 * `plan-textes-de-la-boutique.md`, §6).
 *
 * Le catalogue, les points de retrait et les créneaux sont COMMUNS à tous les
 * parcours (`demo-data/`) : ce qui change d'un cas à l'autre est ici.
 */
export interface PreviewWorld {
  /** `null` : un visiteur. Sinon la personne telle que `GET /me` la rend. */
  readonly account: AccountView | null;
  /** À qui la boutique prend des commandes. */
  readonly opening: PublicOrderOpeningView;
  readonly loyalty: MyLoyaltyView;
  /** Ce que la passation simulée rend — points, bonus, règlement en ligne ou non. */
  readonly placement: Omit<PlacedOrderResponse, 'id' | 'orderNumber'>;
}

/** Le monde du parcours en cours, fourni à la composition de l'aperçu. */
export const PREVIEW_WORLD = new InjectionToken<PreviewWorld>('PREVIEW_WORLD');

/**
 * Un parcours : un monde, puis les gestes qui amènent l'écran ou le dialogue à
 * montrer — par les API PUBLIQUES de la boutique (stores, dialogues, routeur),
 * jamais en écrivant leur état en dessous.
 */
export interface PreviewJourney {
  readonly id: ShopCopyPreviewJourney;
  readonly world: PreviewWorld;
  enter(injector: Injector): Promise<void>;
}
