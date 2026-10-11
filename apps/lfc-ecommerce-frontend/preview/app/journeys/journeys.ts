import type {
  ShopCopyAudience,
  ShopCopyPreviewStep,
  ShopCopyPreviewStepsOf,
} from '@lfd/contracts/shop-copy-preview';

import { CART } from './cart.scenes';
import { CONFIRMATION } from './confirmation.scenes';
import { PERSONAL_OUTSIDE, PRO_OUTSIDE } from './outside.scenes';
import { PAYMENT } from './payment.scenes';
import type { PreviewJourney } from './preview-world';
import { ROUTING } from './routing.scenes';
import { SHOP } from './shop.scenes';
import { TIME } from './time.scenes';
import { WELCOME } from './welcome.scenes';

function orderSteps(audience: ShopCopyAudience) {
  return {
    welcome: WELCOME[audience],
    routing: ROUTING[audience],
    time: TIME[audience],
    shop: SHOP[audience],
    cart: CART[audience],
    payment: PAYMENT[audience],
    confirmation: CONFIRMATION[audience],
  };
}

/**
 * **Les scènes de l'aperçu** — une clientèle × une étape. Typé sur le contrat :
 * une étape qu'une clientèle a (`ShopCopyPreviewStepsOf`) sans scène ici ne
 * compile pas.
 */
export const PREVIEW_SCENES: {
  readonly [A in ShopCopyAudience]: Readonly<Record<ShopCopyPreviewStepsOf<A>, PreviewJourney>>;
} = {
  visitor: orderSteps('visitor'),
  personal: { ...orderSteps('personal'), ...PERSONAL_OUTSIDE },
  pro: { ...orderSteps('pro'), ...PRO_OUTSIDE },
};

/** La scène d'une clientèle à une étape ; `null` si elle ne l'a pas (un visiteur n'a pas de fidélité). */
export function previewScene(
  audience: ShopCopyAudience,
  step: ShopCopyPreviewStep,
): PreviewJourney | null {
  const scenes: Readonly<Partial<Record<ShopCopyPreviewStep, PreviewJourney>>> =
    PREVIEW_SCENES[audience];
  return scenes[step] ?? null;
}
