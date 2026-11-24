/* La recherche de produits, pure : aucun Angular, réutilisable par tout front et par l'API. */
export {
  damerauLevenshtein,
  normalizeSearchText,
  searchProducts,
  typoBudget,
} from './search-products';
export type { ProductSearchKeys } from './search-products';
