import type { ShopCopyPreviewJourney } from '@lfd/contracts/shop-copy-preview';

import { CUSTOMER_SIGNED_IN } from './customer-signed-in.journey';
import type { PreviewJourney } from './preview-world';
import { PRO_ON_ACCOUNT } from './pro-on-account.journey';
import { SHOP_CLOSED } from './shop-closed.journey';
import { VISITOR_CART_WITHOUT_PLACE } from './visitor-cart-without-place.journey';
import { VISITOR_CHOOSING_PLACE } from './visitor-choosing-place.journey';
import { VISITOR_CONFIRMATION } from './visitor-confirmation.journey';
import { VISITOR_FIRST_VISIT } from './visitor-first-visit.journey';
import { VISITOR_READY_TO_PAY } from './visitor-ready-to-pay.journey';

/**
 * **Les huit parcours**, par leur identifiant du protocole. Un `Record` sur le
 * type du contrat : un parcours ajouté à `SHOP_COPY_PREVIEW_JOURNEYS` sans être
 * écrit ici ne compile pas.
 */
export const PREVIEW_JOURNEYS: Readonly<Record<ShopCopyPreviewJourney, PreviewJourney>> = {
  'visitor-first-visit': VISITOR_FIRST_VISIT,
  'visitor-choosing-place': VISITOR_CHOOSING_PLACE,
  'visitor-cart-without-place': VISITOR_CART_WITHOUT_PLACE,
  'visitor-ready-to-pay': VISITOR_READY_TO_PAY,
  'visitor-confirmation': VISITOR_CONFIRMATION,
  'customer-signed-in': CUSTOMER_SIGNED_IN,
  'pro-on-account': PRO_ON_ACCOUNT,
  'shop-closed': SHOP_CLOSED,
};
