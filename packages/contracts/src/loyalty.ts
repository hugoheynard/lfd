import { z } from "zod";

/**
 * **La fidélité** — ce que la comptabilité règle et consulte : le ratio de
 * conversion, les soldes par titulaire, les bons émis. Plan
 * `documentation/comptabilite/fidelite/plan-points-de-fidelite.md` (lots A et B).
 */

/** Le motif d'un geste du staff : obligatoire, lisible, borné. */
export const LOYALTY_REASON_MAX = 500;

/** Qui détient des points : la société (pro) ou la personne (particulier). */
export const loyaltyHolderKindSchema = z.enum(["company", "user"]);
export type LoyaltyHolderKind = z.infer<typeof loyaltyHolderKindSchema>;

/**
 * Un titulaire, avec le nom sous lequel l'écran le montre : la raison sociale
 * d'une société, le nom d'une personne. `null` pour une personne dont le
 * profil ne porte pas de nom — son adresse n'en tient jamais lieu.
 */
export interface LoyaltyHolderView {
  readonly kind: LoyaltyHolderKind;
  readonly id: string;
  readonly label: string | null;
}

/**
 * Le réglage du programme. `null` = aucun réglage posé, donc programme
 * **fermé** : aucune conversion possible.
 */
export interface LoyaltySettingsView {
  readonly settings: {
    readonly pointsPerStep: number;
    readonly stepValueCents: number;
    readonly openToPublic: boolean;
    readonly openToPro: boolean;
    readonly voucherValidityDays: number;
  } | null;
}

/** Tout se pose d'un coup : aucune colonne n'a de défaut (plan D5). */
export const setLoyaltySettingsPayloadSchema = z.object({
  pointsPerStep: z.int().positive(),
  stepValueCents: z.int().positive(),
  openToPublic: z.boolean(),
  openToPro: z.boolean(),
  voucherValidityDays: z.int().positive(),
});
export type SetLoyaltySettingsPayload = z.infer<typeof setLoyaltySettingsPayloadSchema>;

/** Le solde d'un titulaire — la somme de son livre. */
export interface LoyaltyBalanceView {
  readonly holder: LoyaltyHolderView;
  readonly points: number;
}

/**
 * L'état d'un bon **tel qu'on le lit maintenant** : un bon `available` dont la
 * date limite est passée se lit `expired`, même avant d'avoir été écrit ainsi.
 *
 * `reserved` (lot C) : engagé sur une commande vivante. Faute d'état `used`,
 * c'est la commande qui dit s'il a servi — cf. {@link LoyaltyVoucherView.usedOn}.
 */
export const loyaltyVoucherStatusSchema = z.enum(["available", "expired", "cancelled", "reserved"]);
export type LoyaltyVoucherStatus = z.infer<typeof loyaltyVoucherStatusSchema>;

/** Un bon de fidélité : son montant, son coût et le ratio figés à l'émission. */
export interface LoyaltyVoucherView {
  readonly id: string;
  readonly holder: LoyaltyHolderView;
  readonly valueCents: number;
  readonly pointsCost: number;
  readonly ratio: { readonly pointsPerStep: number; readonly stepValueCents: number };
  /** Instants ISO 8601. */
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly status: LoyaltyVoucherStatus;
  readonly cancelledAt: string | null;
  readonly cancellationReason: string | null;
  /**
   * La commande **vivante** qui porte un bon `reserved` — « utilisé sur … ».
   * `null` pour tout autre état, ou si aucune commande vivante ne le porte
   * (un état que la réservation en transaction rend anormal).
   */
  readonly usedOn: { readonly orderId: string; readonly orderNumber: string } | null;
}

const reason = () => z.string().trim().min(1).max(LOYALTY_REASON_MAX);

/** Un ajustement motivé : des points en plus (positif) ou en moins (négatif). */
export const adjustLoyaltyPointsPayloadSchema = z.object({
  holderKind: loyaltyHolderKindSchema,
  holderId: z.string().min(1),
  points: z.int().refine((points) => points !== 0, "Un ajustement de zéro point ne change rien."),
  reason: reason(),
});
export type AdjustLoyaltyPointsPayload = z.infer<typeof adjustLoyaltyPointsPayloadSchema>;

/** Annuler un bon disponible : ses points reviennent au titulaire. */
export const cancelLoyaltyVoucherPayloadSchema = z.object({ reason: reason() });
export type CancelLoyaltyVoucherPayload = z.infer<typeof cancelLoyaltyVoucherPayloadSchema>;

/*
 * ─── L'espace du particulier (lot E1) ────────────────────────────────────
 *
 * Ce que la boutique montre à une personne connectée, dans son espace
 * personnel : son solde, ce que vaut un palier, ses bons, son historique.
 * Plan `documentation/comptabilite/fidelite/plan-points-de-fidelite.md`, §12.
 */

/**
 * Un bon **à soi**. Pas de titulaire (c'est soi), pas de motif d'annulation
 * (il est écrit pour le staff), pas de ratio (le client lit une valeur).
 */
export interface MyLoyaltyVoucherView {
  readonly id: string;
  /** La valeur du bon, **hors taxe**, en centimes. */
  readonly valueCents: number;
  /** Instants ISO 8601. */
  readonly issuedAt: string;
  readonly expiresAt: string;
  /** L'état lu à l'horloge, comme {@link LoyaltyVoucherView.status}. */
  readonly status: LoyaltyVoucherStatus;
  /** La commande vivante qui porte un bon `reserved` — « utilisé sur … » ; `null` sinon. */
  readonly usedOn: { readonly orderId: string; readonly orderNumber: string } | null;
}

/**
 * La sorte d'une ligne de l'historique, **pas un libellé** : la boutique la
 * met en mots — `earned` « Commande CMD-… », `converted` « Conversion en
 * bon », `adjusted` « Ajustement ».
 */
export const myLoyaltyEntryKindSchema = z.enum(["earned", "converted", "adjusted"]);
export type MyLoyaltyEntryKind = z.infer<typeof myLoyaltyEntryKindSchema>;

/**
 * Une ligne du livre, vue par son titulaire. Le motif d'un ajustement n'y est
 * **pas** : il est écrit par le staff, pour le staff.
 */
export interface MyLoyaltyEntryView {
  readonly id: string;
  readonly kind: MyLoyaltyEntryKind;
  /** Signé : positif au gain, négatif à la conversion. */
  readonly points: number;
  /** Instant ISO 8601. */
  readonly occurredAt: string;
  /** Le numéro de la commande qui a rapporté les points (`earned`), `null` sinon. */
  readonly orderNumber: string | null;
}

/**
 * **Ma fidélité.** Fermée (`open: false`) quand le programme n'a pas de
 * réglage, n'est pas ouvert au public, ou que l'espace courant est une
 * société (lot F) : la boutique ne montre alors rien, et rien ne dit
 * « bientôt ».
 */
export type MyLoyaltyView =
  | { readonly open: false }
  | {
      readonly open: true;
      /** La somme du livre. */
      readonly balancePoints: number;
      /** Le ratio d'aujourd'hui : `pointsPerStep` points valent `stepValueCents` centimes HT. */
      readonly pointsPerStep: number;
      readonly stepValueCents: number;
      /** `floor(balancePoints / pointsPerStep)` — le plus grand bon convertible. */
      readonly convertibleSteps: number;
      /**
       * Les bons `available` et `reserved` d'abord (du plus proche de sa date
       * limite au plus lointain), puis les 20 derniers `expired`/`cancelled`.
       */
      readonly vouchers: readonly MyLoyaltyVoucherView[];
      /** Les 20 dernières lignes du livre, de la plus récente à la plus ancienne. */
      readonly entries: readonly MyLoyaltyEntryView[];
    };

/**
 * Convertir des points en bon, depuis son espace.
 *
 * `expectedBalancePoints` est le solde que l'écran affichait : relu sous le
 * verrou, un solde différent refuse la conversion (409). C'est ce qui rend un
 * double clic inoffensif — le premier a baissé le solde, le second échoue.
 */
export const convertMyLoyaltyPointsPayloadSchema = z.object({
  steps: z.int().positive(),
  expectedBalancePoints: z.int().nonnegative(),
});
export type ConvertMyLoyaltyPointsPayload = z.infer<typeof convertMyLoyaltyPointsPayloadSchema>;

/** La réponse d'une conversion : le bon émis. */
export interface MyLoyaltyConversionResponse {
  readonly voucherId: string;
}
