export type {
  LocalizedText,
  Locale,
  TranslatedLocale,
  SoldChannel,
  SalesChannels,
  CreatedIdResponse,
} from "./shared.js";
export {
  LOCALES,
  SOURCE_LOCALE,
  readLocalized,
  writeLocalized,
  filledLocales,
  missingLocales,
} from "./shared.js";

export { localizedTextSchema, optionalLocalizedTextSchema } from "./localized.js";

export { mediaItemPayloadSchema, setMediaPayloadSchema } from "./media.js";
export type {
  AttachedMediaView,
  MediaFactsView,
  SetMediaPayload,
  UploadedMediaView,
} from "./media.js";

export type { AllergenEntry, AllergenReference, AllergenScope } from "./allergen.js";
export {
  createAllergenCategoryPayloadSchema,
  createAllergenEntryPayloadSchema,
  moveAllergenCategoryPayloadSchema,
  renameAllergenCategoryPayloadSchema,
  reviseAllergenEntryPayloadSchema,
} from "./allergen.js";
export type {
  AllergenCategoryAdminView,
  AllergenEntryAdminView,
  CreateAllergenCategoryPayload,
  CreateAllergenEntryPayload,
  MoveAllergenCategoryPayload,
  RenameAllergenCategoryPayload,
  ReviseAllergenEntryPayload,
} from "./allergen.js";

export { vatRatePayloadSchema } from "./commerce.js";
export type { VatRatePayload, VatRateView } from "./commerce.js";

export {
  proPriceRatioPayloadSchema,
  MAX_RATIO_BP,
  proPriceFromPublic,
  proPriceOf,
  proPriceMethodPayloadSchema,
  PRO_PRICE_METHODS,
  proHtFromPublic,
} from "./accounting-rules.js";
export type {
  ProPriceRatioPayload,
  ProPriceMethodPayload,
  ProPriceMethod,
  ProPricePolicy,
  ProPrice,
  AccountingRulesView,
} from "./accounting-rules.js";

/**
 * 🔴 **Réexport, plus une définition** (2026-09-21). `tax.ts` a rejoint
 * `@lfd/money` le jour où la plateforme B2B a eu besoin de la même déduction
 * pour convertir un prix public posé à la main : deux sites qui arrondissent de
 * l'argent doivent appeler la MÊME fonction.
 *
 * La ligne reste pour que les appelants du référentiel ne bougent pas — et
 * parce qu'un prix d'étiquette mis hors taxe reste une opération que le
 * vocabulaire du PIM nomme.
 */
export { htFromTtc, htMillicentsOf } from "@lfd/money";

export {
  createCategoryPayloadSchema,
  moveCategoryPayloadSchema,
  renameCategoryPayloadSchema,
  reorderCategoriesPayloadSchema,
  setCategoryChannelsPayloadSchema,
  createSalesContextPayloadSchema,
  salesChannelsSchema,
  soldChannelSchema,
  updateSalesContextPayloadSchema,
  setCategoryVatPayloadSchema,
  categoryEditorialPayloadSchema,
  setCategoryMediaPayloadSchema,
} from "./category.js";
export type {
  CreateCategoryPayload,
  MoveCategoryPayload,
  RenameCategoryPayload,
  ReorderCategoriesPayload,
  SetCategoryChannelsPayload,
  SetCategoryVatPayload,
  CategoryView,
  CategoryDetailView,
  CategoryEditorialPayload,
  CategoryEditorialView,
  CategoryMediaView,
  SetCategoryMediaPayload,
  CreateSalesContextPayload,
  SalesContextAdminView,
  UpdateSalesContextPayload,
  SalesContextView,
} from "./category.js";

export {
  MAX_TABLES,
  openPointOfSalePayloadSchema,
  pointOfSaleKindSchema,
  updatePointOfSalePayloadSchema,
} from "./points-of-sale.js";
export type {
  OpenPointOfSalePayload,
  PointOfSaleKindView,
  PointOfSaleView,
  TableQrResponse,
  TableView,
  UpdatePointOfSalePayload,
} from "./points-of-sale.js";

export {
  productKindSchema,
  createProductPayloadSchema,
  updateProductIdentityPayloadSchema,
  updateVariantPricingPayloadSchema,
  productEditorialPayloadSchema,
  saveVariantAllergensPayloadSchema,
  saveVariantNutritionPayloadSchema,
  setProductMediaPayloadSchema,
  setProductChannelsPayloadSchema,
  setProductVatPayloadSchema,
  addProductVariantPayloadSchema,
  renameProductVariantPayloadSchema,
  alignVariantPayloadSchema,
  variantAspectSchema,
} from "./product.js";
export type {
  ProductKind,
  ProductStatus,
  CreateProductPayload,
  UpdateProductIdentityPayload,
  UpdateVariantPricingPayload,
  ProductEditorialPayload,
  SaveVariantAllergensPayload,
  SaveVariantNutritionPayload,
  VariantAllergenSheet,
  VariantNutritionView,
  VariantView,
  ProductView,
  ProductEditorialView,
  ProductDetailView,
  ProductReadinessView,
  ProductMediaView,
  SetProductMediaPayload,
  SetProductChannelsPayload,
  SetProductVatPayload,
  AddProductVariantPayload,
  RenameProductVariantPayload,
  AlignVariantPayload,
  VariantAspect,
} from "./product.js";

export { setB2bMembershipPayloadSchema, setB2bMembershipsPayloadSchema } from "./b2b-channel.js";
export type {
  SetB2bMembershipPayload,
  SetB2bMembershipsPayload,
  B2bMembershipView,
  B2bMembershipBatchResult,
  B2bExclusionReason,
  B2bExclusionView,
  B2bIngestionReportView,
  B2bPushSummaryView,
  B2bDeliveryFactsView,
  B2bProductDeliveryView,
} from "./b2b-channel.js";

export type {
  FieldDiffView,
  CatalogRevisionSummaryView,
  CatalogRevisionRowView,
  CatalogRevisionItemDiffView,
  CatalogRevisionDiffView,
  CatalogPendingDiffView,
  CatalogRevisionTakenView,
  AttributedFieldDiffView,
  CatalogRevisionCauseView,
} from "./catalog-revision.js";

export type { CatalogOverviewView } from "./catalog-overview.js";

export {
  createAppellationPayloadSchema,
  updateAppellationPayloadSchema,
  createIngredientPayloadSchema,
  updateIngredientPayloadSchema,
  setProductIngredientsPayloadSchema,
  setIngredientAllergensPayloadSchema,
} from "./ingredient.js";
export type { PimCapabilitiesView } from "./catalog-overview.js";
export type {
  AppellationView,
  IngredientView,
  CreateAppellationPayload,
  UpdateAppellationPayload,
  CreateIngredientPayload,
  UpdateIngredientPayload,
  SetProductIngredientsPayload,
  SetIngredientAllergensPayload,
  VariantAllergenGapView,
  ProductIngredientAllergensView,
} from "./ingredient.js";

export {
  ORDER_TIME_LIMIT_SCOPES,
  ORDER_TIME_LIMIT_SCOPE_LABELS,
  orderLimitTimeSchema,
  orderTimeLimitPayloadSchema,
  orderTimeLimitScopeSchema,
  orderTimeLimitScopeTypeSchema,
} from "./order-time-limit.js";
export type {
  OrderTimeLimitPayload,
  OrderTimeLimitScope,
  OrderTimeLimitScopeType,
  OrderTimeLimitView,
  SetOrderTimeLimitResponse,
  ResolvedOrderTimeLimit,
} from "./order-time-limit.js";

export {
  categoryPathOf,
  explainOrderTimeLimit,
  resolveOrderTimeLimit,
} from "./order-time-limit-resolution.js";
export type {
  CategoryNode,
  ExplainedOrderTimeLimit,
  LimitTarget,
  ResolvedField,
} from "./order-time-limit-resolution.js";

export { productHistoryQuerySchema } from "./product-history.js";
export type {
  ProductHistoryQuery,
  ProductHistoryInheritedKind,
  ProductHistoryInheritanceView,
  ProductHistoryPlacementView,
  ProductHistoryEntryView,
  ProductHistoryPageView,
} from "./product-history.js";
