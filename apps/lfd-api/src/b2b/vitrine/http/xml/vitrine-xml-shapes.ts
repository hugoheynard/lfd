import {
  contentLocales,
  type ShopImageFocal,
  type ShopImageView,
  type ShopItemOperationView,
  type ShopItemOrderLimit,
  type ShopOperationText,
  type ShopOperationView,
  type ShopShelfView,
  type VitrineCatalogueView,
  type VitrineItemView,
  type VitrineTextsView,
} from "@lfd/contracts";

import {
  listOf,
  objectOf,
  oneOf,
  optional,
  required,
  xmlBoolean,
  xmlDecimal,
  xmlInteger,
  xmlString,
  type XmlObjectShape,
} from "./xml-shape.js";

/**
 * **Les trois documents XML de la vitrine**, décrits champ par champ contre
 * les vues JSON du contrat (Hugo, 2026-10-18) : même structure, mêmes noms.
 *
 * `XmlFieldsOf<T>` exige une entrée par clé de la vue : un champ ajouté à
 * `ShopItemView` ne compile plus ici tant qu'on ne lui a pas donné sa forme,
 * et le XSD servi (`GET /vitrine/schema.xsd`) en est dérivé.
 */

const language = oneOf(contentLocales);
const operationState = oneOf(["announced", "open", "closed"]);

const focal = objectOf<ShopImageFocal>({
  x: required(xmlDecimal),
  y: required(xmlDecimal),
});

const image = objectOf<ShopImageView>({
  url: required(xmlString),
  alt: required(xmlString),
  width: optional(xmlInteger),
  height: optional(xmlInteger),
  focal: optional(focal),
});

/** Ce qui est multilingue dans le JSON le reste : `<name><fr>…</fr><en>…</en></name>`. */
const operationText = objectOf<ShopOperationText>({
  fr: required(xmlString),
  en: optional(xmlString),
  it: optional(xmlString),
});

const itemOperation = objectOf<ShopItemOperationView>({
  key: required(xmlString),
  state: required(operationState),
});

/** La limite propre d'un article, plus stricte que la générale (2026-10-21). */
const itemOrderLimit = objectOf<ShopItemOrderLimit>({
  daysBefore: required(xmlInteger),
  time: required(xmlString),
});

export const VITRINE_ITEM_SHAPE: XmlObjectShape = objectOf<VitrineItemView>({
  sku: required(xmlString),
  name: required(xmlString),
  note: optional(xmlString),
  image: optional(image),
  thumbnail: optional(image),
  unitPriceMillicents: required(xmlInteger),
  unitPriceTtcCents: required(xmlInteger),
  catalogPriceMillicents: optional(xmlInteger),
  vatRatePercent: required(xmlDecimal),
  shelfId: required(xmlString),
  isFeatured: optional(xmlBoolean),
  audience: required(oneOf(["public", "pro", "both"])),
  operation: optional(itemOperation),
  orderTimeLimit: optional(itemOrderLimit),
});

const shelf = objectOf<ShopShelfView>({
  id: required(xmlString),
  name: required(xmlString),
  position: required(xmlInteger),
});

const operation = objectOf<ShopOperationView>({
  key: required(xmlString),
  name: required(operationText),
  lede: optional(operationText),
  image: optional(
    objectOf<NonNullable<ShopOperationView["image"]>>({
      url: required(xmlString),
      alt: required(xmlString),
      focal: optional(focal),
    }),
  ),
  state: required(operationState),
  orderFrom: required(xmlString),
  orderUntil: required(xmlString),
  pickupFrom: required(xmlString),
  pickupUntil: required(xmlString),
  skus: required(listOf("sku", xmlString)),
  announceFrom: optional(xmlString),
  awaitingProducts: optional(xmlBoolean),
  showsOrderUntilTime: optional(xmlBoolean),
});

export const VITRINE_CATALOGUE_SHAPE: XmlObjectShape = objectOf<VitrineCatalogueView>({
  language: required(language),
  shelves: required(listOf("shelf", shelf)),
  items: required(listOf("item", VITRINE_ITEM_SHAPE)),
  operations: required(listOf("operation", operation)),
});

export const VITRINE_TEXTS_SHAPE: XmlObjectShape = objectOf<VitrineTextsView>({
  language: required(language),
  texts: required({ kind: "dictionary", entry: "text", keyAttribute: "key" }),
});

/** Les racines des trois lectures, et l'élément qui porte chacune. */
export const VITRINE_XML_ROOTS = {
  catalogue: VITRINE_CATALOGUE_SHAPE,
  item: VITRINE_ITEM_SHAPE,
  texts: VITRINE_TEXTS_SHAPE,
} as const satisfies Readonly<Record<string, XmlObjectShape>>;

export type VitrineXmlRoot = keyof typeof VITRINE_XML_ROOTS;
