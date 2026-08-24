export {
  ShopifyAdminError,
  ShopifyTransportError,
  ShopifyRejectedError,
  ShopifyNotConfiguredError,
} from "./errors.js";
export type { ShopifyErrorCategory } from "./errors.js";

export type { ShopifyOAuthCredentials, ShopifyCredentialsSource } from "./credentials.js";
export type { ShopifyStoreSettings, ShopifyStoreCoordinates } from "./store-settings.js";

export type { ShopifyProductSnapshot, ShopifyVariantSnapshot } from "./product-snapshot.js";
export { VAT_HANDLE_PREFIX } from "./collection-types.js";
export type { ShopifyCollection, DesiredCollection } from "./collection-types.js";

export { ShopifyTokenProvider } from "./token-provider.js";
export { ShopifyAdminClient } from "./admin-client.js";
export type { ShopifyShopIdentity } from "./admin-client.js";
