export { CompanyIdentityCard } from './company-identity-card/company-identity-card';
export { CompanyContactsCard } from './company-contacts-card/company-contacts-card';
export { CompanyReferenceCard } from './company-reference-card/company-reference-card';
export { CompanyAddressesCard } from './company-addresses-card/company-addresses-card';
export { CompanyBillingCard } from './company-billing-card/company-billing-card';
export { CompanyFulfillmentCard } from './company-fulfillment-card/company-fulfillment-card';
export { CompanyIdentityFields } from './company-identity-fields/company-identity-fields';
export { ContactFields } from './contact-fields/contact-fields';
export { AddressFields } from './address-fields/address-fields';
export { CompanyActivationChecklist } from './company-activation-checklist/company-activation-checklist';
export type { CompanyActivationStep } from './company-activation-checklist/company-activation-checklist';
export type {
  CompanyBadgeTone,
  CompanyIdentityView,
  CompanyKbisView,
} from './company-identity.view-model';
export type { CompanyContactCardView } from './company-contacts.view-model';
export { formatSiret } from './format';
export {
  EMPTY_COMPANY_IDENTITY_DRAFT,
  EMPTY_COMPANY_CONTACT_DRAFT,
  isCompanyIdentityValid,
  isCompanyIdentityOpenable,
  isAdditionalContactValid,
  isCompanyContactValid,
} from './company-form.model';
export type { CompanyIdentityDraft, CompanyContactDraft } from './company-form.model';
export {
  EMPTY_ADDRESS_DRAFT,
  BLANK_DAYS,
  billingDraftFrom,
  deliveryDraftFrom,
  fromSlotByDay,
  toSlot,
  isBadSlot,
  slotIssueOf,
  contactIssueOf,
  gpsIssueOf,
  isAddressValid,
  postalFrom,
  postalOfDraft,
  withPostal,
  toBillingPayload,
  toDeliveryPayload,
} from './address-form.model';
export type { AddressDraft, DraftDay, DraftDays } from './address-form.model';
export { EMPTY_POSTAL_DRAFT, postalDraftFrom, postalIssue, toPostal } from './postal-draft.model';
export type { FrenchPostal, PostalDraft } from './postal-draft.model';
export {
  EMPTY_DELIVERY_DRAFT,
  EMPTY_DELIVERY_SPECS,
  deliveryIssueOf,
} from './delivery-draft.model';
export type { DeliveryDraft, DeliverySpecsDraft } from './delivery-draft.model';
export {
  WEEKDAYS,
  formatSlot,
  hasDeliverySlot,
  weeklySlots,
  formatDeliveryContact,
  formatGps,
  gpsMapUrl,
} from './delivery-format';
export {
  DEFAULT_DESTINATION,
  destinationOf,
  fulfillmentDestinations,
  namedDestinations,
  noPreference,
  preferenceForDestination,
  preferenceForMethod,
  preferenceForSignature,
} from './fulfillment-preference.model';
export type { FulfillmentDestination } from './fulfillment-preference.model';
