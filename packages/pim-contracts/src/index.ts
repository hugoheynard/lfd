export type { LocalizedText, Locale, TranslatedLocale, CreatedIdResponse } from "./shared.js";
export {
  LOCALES,
  SOURCE_LOCALE,
  readLocalized,
  writeLocalized,
  filledLocales,
  missingLocales,
} from "./shared.js";

export { localizedTextSchema, optionalLocalizedTextSchema } from "./localized.js";

export {
  mediaDetailsPayloadSchema,
  mediaLibraryQuerySchema,
  mediaSeriesPayloadSchema,
  renameMediaTagPayloadSchema,
  replaceMediaPayloadSchema,
} from "./media.js";
export {
  MEDIA_LIMITS,
  MEDIA_LIBRARY_SORTS,
  MEDIA_CARRIER_KINDS,
  MEDIA_MAX_TAGS_PER_IMAGE,
} from "./media.js";
export { mediaItemPayloadSchema, setMediaPayloadSchema } from "./attached-media.js";
export type { AttachedMediaView, SetMediaPayload } from "./attached-media.js";
export { isMediaAltWritten, mediaAltOrUrl, type DraftAlt } from "./media-alt.js";
export {
  PALETTE_LIMITS,
  PALETTE_MAX_SWATCHES,
  PALETTE_HEX_PATTERN,
  paletteSwatchSchema,
  imagePaletteSchema,
  mediaPalettePayloadSchema,
  PALETTE_STRIP_LIMITS,
  mediaPaletteStripQuerySchema,
  paletteStripColumnSchema,
  mediaPaletteStripViewSchema,
} from "./media-palette.js";
export type {
  PaletteSwatch,
  ImagePalette,
  MediaPalettePayload,
  MediaPaletteStripQuery,
  PaletteStripColumnView,
  MediaPaletteStripView,
} from "./media-palette.js";

export type {
  MediaFactsView,
  MediaCarrierKind,
  UploadedMediaView,
  FocalPoint,
  LibraryMediaView,
  MediaCarrierView,
  MediaUploadFailureView,
  MediaLibraryPageView,
  MediaLibraryQuery,
  MediaLibrarySort,
  MediaDetailsPayload,
  MediaTagView,
  RenameMediaTagPayload,
  ReplaceMediaPayload,
  MediaSeriesPayload,
  MediaSeriesRefView,
  MediaSeriesView,
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
  PRO_PRICE_PREFILL_STATUSES,
  proHtFromPublic,
  UNSET_PRO_PRICE_POLICY,
} from "./accounting-rules.js";
export type {
  ProPriceRatioPayload,
  ProPriceMethodPayload,
  ProPriceMethod,
  ProPricePolicy,
  ProPrice,
  AccountingRulesView,
  ProPricePrefillStatus,
  ProPricePrefillRowView,
  ProPricePrefillPreviewView,
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
  createSalesContextPayloadSchema,
  updateSalesContextPayloadSchema,
  setCategoryVatPayloadSchema,
  setCategoryAudiencePayloadSchema,
  categoryEditorialPayloadSchema,
  setCategoryMediaPayloadSchema,
} from "./category.js";
export type {
  CreateCategoryPayload,
  MoveCategoryPayload,
  RenameCategoryPayload,
  ReorderCategoriesPayload,
  SetCategoryVatPayload,
  SetCategoryAudiencePayload,
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
  productKindSchema,
  createProductPayloadSchema,
  updateProductIdentityPayloadSchema,
  updateVariantPricingPayloadSchema,
  productEditorialPayloadSchema,
  saveVariantAllergensPayloadSchema,
  saveVariantNutritionPayloadSchema,
  setProductMediaPayloadSchema,
  setProductOperationOnlyPayloadSchema,
  setProductColdRequirementPayloadSchema,
  setProductAudiencePayloadSchema,
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
  SetProductOperationOnlyPayload,
  SetProductColdRequirementPayload,
  SetProductAudiencePayload,
  SetProductVatPayload,
  AddProductVariantPayload,
  RenameProductVariantPayload,
  AlignVariantPayload,
  VariantAspect,
} from "./product.js";

export type { ReemissionReportView } from "./b2b-channel.js";

export type {
  FieldDiffView,
  CatalogRevisionSummaryView,
  CatalogRevisionRowView,
  CatalogRevisionItemDiffView,
  CatalogRevisionDiffView,
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

export { OPERATION_AUDIENCES, operationAudienceSchema } from "./operation.js";
export type { OperationAudience } from "./operation.js";
