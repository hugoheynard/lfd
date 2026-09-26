import { z } from "zod";

/**
 * **La fidélité** — ce que la comptabilité règle et consulte : le ratio de
 * conversion, les soldes par titulaire, les bons émis. Plan
 * `documentation/comptabilite/plan-points-de-fidelite.md` (lots A et B).
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
 */
export const loyaltyVoucherStatusSchema = z.enum(["available", "expired", "cancelled"]);
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
