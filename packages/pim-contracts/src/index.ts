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
export { isDescriptiveAltText, isMediaAltWritten, type DraftAlt } from "./media-alt.js";
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

export {
  ALLERGEN_MATRIX_WORDING,
  ALLERGEN_MATRIX_ROW_STATES,
  ALLERGEN_MATRIX_SCOPES,
  allergenMatrixQuerySchema,
} from "./allergen-matrix.js";
export type {
  AllergenMatrixCell,
  AllergenMatrixColumn,
  AllergenMatrixFamily,
  AllergenMatrixFamilyChoice,
  AllergenMatrixOtherAllergen,
  AllergenMatrixOthersCell,
  AllergenMatrixDocumentWording,
  AllergenMatrixWording,
  AllergenMatrixPresence,
  AllergenMatrixQuery,
  AllergenMatrixRow,
  AllergenMatrixRowState,
  AllergenMatrixScope,
  AllergenMatrixView,
} from "./allergen-matrix.js";

export { vatRatePayloadSchema } from "./commerce.js";
export type { VatRatePayload, VatRateView } from "./commerce.js";

export { proPriceOf } from "./pro-price.js";
export type { ProPrice } from "./pro-price.js";

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
  setProductVariantsAsTilesPayloadSchema,
  setProductAudiencePayloadSchema,
  setProductVatPayloadSchema,
  addProductVariantPayloadSchema,
  renameProductVariantPayloadSchema,
  setVariantShopNamePayloadSchema,
  alignVariantPayloadSchema,
  variantAspectSchema,
  saleUnitSchema,
  variantMinQuantitiesSchema,
  setVariantMinQuantitiesPayloadSchema,
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
  ProductListView,
  ProductActivationGapsView,
  ProductEditorialView,
  ProductDetailView,
  ProductLineageView,
  DetachedProductView,
  ProductReadinessView,
  ProductMediaView,
  SetProductMediaPayload,
  SetProductOperationOnlyPayload,
  SetProductColdRequirementPayload,
  SetProductVariantsAsTilesPayload,
  SetProductAudiencePayload,
  SetProductVatPayload,
  AddProductVariantPayload,
  RenameProductVariantPayload,
  SetVariantShopNamePayload,
  AlignVariantPayload,
  VariantAspect,
  SaleUnit,
  VariantMinQuantities,
  SetVariantMinQuantitiesPayload,
} from "./product.js";

export type {
  CatalogReemissionFailureView,
  CatalogReemissionScope,
  CatalogReemissionStatus,
  CatalogReemissionView,
  LatestCatalogReemissionView,
} from "./b2b-channel.js";

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
  complianceSeveritySchema,
  productComplianceFindingSchema,
  productComplianceWarningViewSchema,
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
  ComplianceSeverity,
  ProductComplianceFinding,
  ProductComplianceWarningView,
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
  GeneralOrderCutoffView,
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

export {
  applyIngredientAllergenPropagationPayloadSchema,
  ingredientAllergenPropagationQuerySchema,
} from "./ingredient-allergen-propagation.js";
export type {
  ApplyIngredientAllergenPropagationPayload,
  IngredientAllergenPropagationCounts,
  IngredientAllergenPropagationQuery,
  IngredientAllergenPropagationView,
  ProductAllergenPropagationView,
  VariantAllergenPropagationView,
} from "./ingredient-allergen-propagation.js";
export type { ProductSaleUnitUsageView, VariantSaleUnitUsageView } from "./sale-unit-usage.js";
