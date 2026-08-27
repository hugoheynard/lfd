/**
 * Le rayon, tel que la maquette le connaît.
 *
 * ⚠️ Tout ceci viendra du catalogue serveur. C'est rassemblé ici pour qu'il n'y
 * ait qu'un endroit à débrancher, et parce que deux choses sont des DONNÉES et
 * jamais des constantes de gabarit : le taux de TVA, porté par le RAYON et non
 * par le produit, et le complément prépositionnel du point de retrait
 * (« au Labo ») dont la ligne de remise a besoin pour ne pas dire
 * « Remise Le Labo ».
 *
 * Les photos sont les vignettes SVG déjà servies depuis `public/products/` :
 * une pièce par référence, cadrée carré. Elles tiennent la place des vraies,
 * qui restent à photographier (cf. `06-boutique.md`, « Modèle de données »).
 */

/** Le taux par défaut : pain, viennoiserie, pâtisserie, chocolat. */
export const VAT_DEFAULT = 5.5;

/** Le taux du salé et du traiteur. */
export const VAT_SALE = 10;

/** Un rayon. Son taux de TVA lui appartient — pas au produit. */
export interface ShopCategory {
  readonly id: string;
  /** Le mot court, dans la pastille de filtre. */
  readonly label: string;
  /** Le titre long du rayon, celui qui coiffe la grille. */
  readonly shelf: string;
  readonly vat: number;
}

/**
 * « Tout » n'est PAS un rayon : c'est l'absence de filtre. Il ouvre la liste
 * parce qu'on arrive dessus, mais il ne porte ni taux ni produit.
 */
export const ALL_SHELVES = 'all';

export const SHOP_CATEGORIES: readonly ShopCategory[] = [
  {
    id: 'vienn',
    label: 'Viennoiseries',
    shelf: 'Viennoiseries · le réveil qui claque',
    vat: VAT_DEFAULT,
  },
  { id: 'pains', label: 'Pains', shelf: 'Pains · du vrai pain, pain barre', vat: VAT_DEFAULT },
  {
    id: 'patis',
    label: 'Pâtisseries',
    shelf: 'Pâtisseries · la gourmandise d’altitude',
    vat: VAT_DEFAULT,
  },
  {
    id: 'sale',
    label: 'Salé & traiteur',
    shelf: 'Salé & traiteur · ça tient au corps',
    vat: VAT_SALE,
  },
  {
    id: 'choco',
    label: 'Chocolat',
    shelf: 'Chocolat & confiserie · notre folie',
    vat: VAT_DEFAULT,
  },
];

/** Une référence du rayon. */
export interface ShopProduct {
  readonly id: string;
  readonly category: string;
  readonly name: string;
  /** La ligne du fournil — ce que la fiche dit du produit. */
  readonly note: string;
  readonly price: number;
  /** La vignette carrée, servie depuis `public/products/`. */
  readonly image: string;
  /** La pièce qui ne doit pas se noyer dans son rayon. */
  readonly signature: boolean;
}

export const SHOP_PRODUCTS: readonly ShopProduct[] = [
  {
    id: 'croissant',
    category: 'vienn',
    name: 'Croissant au beurre',
    note: 'Tourage patient, beurre qui ne triche pas',
    price: 1.4,
    image: 'croissant',
    signature: false,
  },
  {
    id: 'painchoc',
    category: 'vienn',
    name: 'Pain au chocolat',
    note: 'Deux barres, ça déborde allègrement',
    price: 1.6,
    image: 'pain-choco',
    signature: false,
  },
  {
    id: 'chausson',
    category: 'vienn',
    name: 'Chausson aux pommes',
    note: 'Doré à la sortie du four',
    price: 2.1,
    image: 'chausson',
    signature: false,
  },
  {
    id: 'tradition',
    category: 'pains',
    name: 'Baguette de tradition',
    note: 'Croûte qui chante · 100 % française',
    price: 1.3,
    image: 'baguette',
    signature: false,
  },
  {
    id: 'campagne',
    category: 'pains',
    name: 'Pain de campagne',
    note: 'Levain nourri chaque jour · 800 g',
    price: 4.8,
    image: 'boule',
    signature: false,
  },
  {
    id: 'cereales',
    category: 'pains',
    name: 'Pain aux céréales',
    note: 'Pour ceux qui sortent du rang · 600 g',
    price: 5.4,
    image: 'pain-mie',
    signature: false,
  },
  {
    id: 'myrtilles',
    category: 'patis',
    name: 'Tarte aux myrtilles',
    note: 'Myrtilles sauvages de nos alpages',
    price: 4.9,
    image: 'florentin',
    signature: false,
  },
  {
    id: 'savoie',
    category: 'patis',
    name: 'Gâteau de Savoie',
    note: 'La tradition, et on la fait vivre',
    price: 3.8,
    image: 'brioche',
    signature: false,
  },
  {
    id: 'eclair',
    category: 'patis',
    name: 'Éclair',
    note: 'Café, chocolat ou pralines roses',
    price: 3.5,
    image: 'eclair',
    signature: false,
  },
  {
    id: 'quiche',
    category: 'sale',
    name: 'Quiche du jour',
    note: 'Tient au corps · part généreuse',
    price: 4.5,
    image: 'quiche',
    signature: false,
  },
  {
    id: 'sandwich',
    category: 'sale',
    name: 'Sandwich de station',
    note: 'Casse-croûte qui casse la croûte',
    price: 6.2,
    image: 'sandwich',
    signature: false,
  },
  {
    id: 'ski',
    category: 'choco',
    name: 'Ski fourré praliné',
    note: 'Notre folie signature. Jamais raisonnable.',
    price: 5.5,
    image: 'boite-choco',
    signature: true,
  },
  {
    id: 'ourson',
    category: 'choco',
    name: 'Pattes d’ourson',
    note: 'Guimauve maison, moelleuse comme un chalet',
    price: 3.2,
    image: 'cookie',
    signature: false,
  },
  {
    id: 'gianduja',
    category: 'choco',
    name: 'Sablé Gianduja',
    note: 'Croustille avant de fondre',
    price: 2.9,
    image: 'escargot',
    signature: false,
  },
];

/** Le taux de TVA du rayon d'un produit. */
export function vatOf(product: ShopProduct): number {
  return SHOP_CATEGORIES.find((c) => c.id === product.category)?.vat ?? VAT_DEFAULT;
}

export function productById(id: string): ShopProduct | null {
  return SHOP_PRODUCTS.find((p) => p.id === id) ?? null;
}

export function categoryOf(product: ShopProduct): ShopCategory | null {
  return SHOP_CATEGORIES.find((c) => c.id === product.category) ?? null;
}

/**
 * Les trois heures de four d'un rayon. Trois valeurs par RAYON, pas par
 * produit : le fournil enfourne par famille.
 */
const OVEN_HOURS: Readonly<Record<string, string>> = {
  vienn: '5 h, 8 h et 15 h',
  pains: '4 h 15, 10 h et 16 h',
  patis: 'montées le matin même',
  sale: '11 h, puis 17 h',
  choco: 'moulées la veille',
};

/** Les heures de four du rayon, telles que la fiche produit les annonce. */
export function ovenHoursOf(categoryId: string): string {
  return OVEN_HOURS[categoryId] ?? 'toute la matinée';
}

/**
 * Le packshot d'un rayon — la photo que portent la bannière et la feuille.
 *
 * ⚠️ Ce sont les vignettes de pièce en attendant les vraies photos de rayon.
 * `06-boutique.md` est clair : une photo carrée par référence est la seule vraie
 * contrainte du modèle, et c'est celle qui change tout.
 */
const SHELF_PACKSHOT: Readonly<Record<string, string>> = {
  vienn: 'croissant',
  pains: 'baguette',
  patis: 'eclair',
  sale: 'quiche',
  choco: 'boite-choco',
};

export function packshotOf(categoryId: string): string {
  return SHELF_PACKSHOT[categoryId] ?? 'boule';
}

/** La commande de la maquette, une fois réglée. */
export const MOCK_ORDER_REF = '4822';
