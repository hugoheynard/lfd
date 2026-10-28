import { z } from "zod";

import {
  sheetCustomerSchema,
  sheetFulfillmentSchema,
  sheetMoneySchema,
  sheetVariantSchema,
  type SheetCustomer,
  type SheetFulfillment,
  type SheetMoney,
  type SheetVariant,
} from "./order-sheet.js";

/**
 * **Le bon de livraison imprimé** — une pièce, trois lecteurs (plan
 * plan E5a (`documentation/commandes/bon-de-livraison.md`), § 1 ;
 * plan-cadre `plan-commande-bon-de-livraison-facture.md`, § 10).
 *
 * Chiffré ou non, ce n'est pas un réglage : **c'est le lecteur qui décide**,
 * sur le modèle du bon de commande (`order-sheet.ts`). Le papier qui voyage
 * avec la marchandise — colisage, livreur, personne qui réceptionne — est le
 * BL **de transport** ; le client et sa comptabilité lisent le BL **client** ;
 * l'équipe lit le BL **équipe**.
 *
 * `CarrierNote` **n'a pas de propriété `money`**, et ses lignes n'ont aucun
 * prix : un rendu qui écrirait un montant sur le papier du carton ne compile
 * pas. Même mécanique qu'`AtelierSheet` — *inexprimable > refusé*. Les trois
 * rendus sont le même BL : les prix restent en base, recopiés de la commande.
 */

/** Le cycle d'un BL, tel que l'équipe le lit. */
export const deliveryNoteStatusSchema = z.enum(["planned", "prepared", "handed_over", "voided"]);
export type DeliveryNoteStatusView = z.infer<typeof deliveryNoteStatusSchema>;

/** Qui lit ce BL. */
export const deliveryNoteAudienceSchema = z.enum(["carrier", "client", "staff"]);
export type DeliveryNoteAudience = z.infer<typeof deliveryNoteAudienceSchema>;

/**
 * Ce que tout BL porte. `issuedAt` est l'instant du dernier pas du BL (remis,
 * sinon préparé, sinon prévu), pas celui du rendu : deux rendus du même état
 * sont identiques.
 */
const noteCommonShape = {
  /** `BL-1042-1`. */
  number: z.string().min(1),
  orderId: z.string().min(1),
  /** Le rappel de la commande, `ORD-…`. */
  orderReference: z.string().min(1),
  orderPlacedAt: z.string().min(1),
  requestedFor: z.string().nullable(),
  /** Jour de réception `AAAA-MM-JJ`, `null` tant que le BL n'est pas remis. */
  receivedOn: z.string().nullable(),
  customer: sheetCustomerSchema,
  fulfillment: sheetFulfillmentSchema,
  note: z.string(),
  issuedAt: z.string().min(1),
} as const;

interface NoteCommon {
  readonly number: string;
  readonly orderId: string;
  readonly orderReference: string;
  readonly orderPlacedAt: string;
  readonly requestedFor: string | null;
  readonly receivedOn: string | null;
  readonly customer: SheetCustomer;
  readonly fulfillment: SheetFulfillment;
  readonly note: string;
  readonly issuedAt: string;
}

/**
 * Une ligne de transport : ce qu'on remet et combien. Une ligne à zéro est
 * recopiée par le BL (« livré = Σ des BL ») ; la quantité est donc ≥ 0.
 */
export const carrierNoteLineSchema = z.object({
  sku: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  /** Cf. {@link CarrierNoteLine.saleUnit}. */
  saleUnit: z.literal("weight").optional(),
});
export interface CarrierNoteLine {
  readonly sku: string;
  readonly productName: string;
  /** Des pièces — ou des GRAMMES quand `saleUnit` vaut `weight`. */
  readonly quantity: number;
  /**
   * `weight` : la ligne se vend au poids et se dit « 500 g », « 1,25 kg »
   * (`vente-au-poids.md`, P5). **Absent = à la pièce**, comme sur le bon
   * de commande (`AtelierSheetLine.saleUnit`) : un BL à la pièce se rend au bit
   * près comme avant.
   */
  readonly saleUnit?: "weight";
}

/** Une ligne chiffrée, recopiée de la commande. */
export const clientNoteLineSchema = carrierNoteLineSchema.extend({
  unitPriceMillicents: z.number().int(),
  vatRate: z.number(),
  lineTotalCents: z.number().int(),
  unitPriceTtcCents: z.number().int().nullable(),
  lineTotalTtcCents: z.number().int().nullable(),
  pickupDiscountEligible: z.literal(false).optional(),
});
export interface ClientNoteLine extends CarrierNoteLine {
  readonly unitPriceMillicents: number;
  readonly vatRate: number;
  readonly lineTotalCents: number;
  /** `null` pour un pro ou une commande d'avant R3 — jamais calculé. */
  readonly unitPriceTtcCents: number | null;
  readonly lineTotalTtcCents: number | null;
  /** `false` quand la remise de retrait ne couvrait pas la ligne ; absent sinon. */
  readonly pickupDiscountEligible?: false;
}

/** Le BL de transport. **Aucune propriété monétaire** — pas même absente. */
export const carrierNoteSchema = z.object({
  ...noteCommonShape,
  audience: z.literal("carrier"),
  lines: z.array(carrierNoteLineSchema),
});
export interface CarrierNote extends NoteCommon {
  readonly audience: "carrier";
  readonly lines: readonly CarrierNoteLine[];
}

const clientNoteShape = {
  ...noteCommonShape,
  variant: sheetVariantSchema,
  customerPhone: z.string().nullable(),
  lines: z.array(clientNoteLineSchema),
  money: sheetMoneySchema,
} as const;

/** Le BL client : chiffré, pro (HT) ou public (TTC) comme le bon de commande. */
export const clientNoteSchema = z.object({ ...clientNoteShape, audience: z.literal("client") });
export interface ClientNote extends NoteCommon {
  readonly audience: "client";
  readonly variant: SheetVariant;
  readonly customerPhone: string | null;
  readonly lines: readonly ClientNoteLine[];
  /** Les totaux recopiés sur le BL (E4a) — jamais recalculés. */
  readonly money: SheetMoney;
}

/**
 * Le BL de l'équipe : le client, plus l'état et ses dates.
 *
 * `money` y est `null` sur un BL écrit avant E4a et resté sans en-tête — un BL
 * annulé avant E4a ne se complète jamais (`completeTermsFrom` le refuse).
 * L'équipe le voit quand même dans la liste ; seul le PDF chiffré est refusé.
 */
export const staffNoteSchema = z.object({
  ...clientNoteShape,
  money: sheetMoneySchema.nullable(),
  audience: z.literal("staff"),
  status: deliveryNoteStatusSchema,
  plannedAt: z.string().min(1),
  preparedAt: z.string().nullable(),
  handedOverAt: z.string().nullable(),
  voidedAt: z.string().nullable(),
  reprintNeeded: z.boolean(),
});
export interface StaffNote extends Omit<ClientNote, "audience" | "money"> {
  readonly audience: "staff";
  readonly money: SheetMoney | null;
  readonly status: DeliveryNoteStatusView;
  readonly plannedAt: string;
  readonly preparedAt: string | null;
  readonly handedOverAt: string | null;
  readonly voidedAt: string | null;
  /**
   * **Le papier ne dit plus le contenu** (plan E6, § 14) : le BL a été
   * imprimé, puis ses lignes ou ses montants ont changé. Calculé par le
   * serveur ; jamais imprimé = `false`. L'écran dit alors « réimprimez-le ».
   */
  readonly reprintNeeded: boolean;
}

/** Le BL, tous lecteurs. Un rendu qui veut un montant doit prouver qu'il n'est pas devant un BL de transport. */
export const deliveryNoteSheetSchema = z.discriminatedUnion("audience", [
  carrierNoteSchema,
  clientNoteSchema,
  staffNoteSchema,
]);
export type DeliveryNoteSheet = CarrierNote | ClientNote | StaffNote;
