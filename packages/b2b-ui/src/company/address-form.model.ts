/**
 * Couche de **compatibilité**, transitoire.
 *
 * Le brouillon d'adresse était un objet gras de dix-neuf champs, accompagné
 * partout d'un drapeau `kind` dont le seul rôle était de dire lesquels ignorer.
 * Il est désormais composé : {@link PostalDraft} pour le lieu, `DeliverySpecsDraft`
 * pour les consignes, et `DeliveryDraft` pour leur somme. Ce fichier ne garde
 * que les anciens noms, le temps que les panneaux basculent — il disparaît avec
 * le dernier appelant.
 */
import type { BillingAddressView } from '@lfd/contracts';

import { deliveryIssueOf, EMPTY_DELIVERY_DRAFT, type DeliveryDraft } from './delivery-draft.model';
import { postalDraftFrom, postalIssue } from './postal-draft.model';

export type { DeliveryDraft as AddressDraft };
export type { DraftDay, DraftDays } from './delivery-draft.model';

export {
  BLANK_DAYS,
  contactIssueOf,
  deliveryDraftFrom,
  fromSlotByDay,
  isBadSlot,
  slotIssueOf,
  toDeliveryPayload,
  toSlot,
} from './delivery-draft.model';
export {
  gpsIssueOf,
  postalFrom,
  toBillingPayload,
  withPostal,
  toPostal as postalOfDraft,
} from './postal-draft.model';

/** @deprecated Utiliser `EMPTY_DELIVERY_DRAFT` (ou `EMPTY_POSTAL_DRAFT`). */
export const EMPTY_ADDRESS_DRAFT: DeliveryDraft = EMPTY_DELIVERY_DRAFT;

/** @deprecated Utiliser `postalDraftFrom` — une facturation EST un brouillon postal. */
export function billingDraftFrom(view: BillingAddressView): DeliveryDraft {
  return { ...EMPTY_DELIVERY_DRAFT, ...postalDraftFrom(view) };
}

/** @deprecated Utiliser `postalIssue` ou `deliveryIssueOf`, selon ce qu'on saisit. */
export function isAddressValid(draft: DeliveryDraft, kind: 'billing' | 'delivery'): boolean {
  return kind === 'billing' ? postalIssue(draft) === '' : deliveryIssueOf(draft) === '';
}
