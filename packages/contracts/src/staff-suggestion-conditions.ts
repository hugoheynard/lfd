import { z } from "zod";

import { weekdaySchema, type Weekday } from "./address.js";

/**
 * ── Les CONDITIONS facultatives d'une suggestion décidée ─────────────────────
 *
 * RS8 (`documentation/recommandation-produit/suggestions-du-staff.md`, §2.1) :
 * en plus du déclencheur, de la période, de la clientèle et de l'emplacement,
 * une règle peut ne valoir qu'à certains jours de la semaine, à certaines
 * heures (Paris), au-delà d'un montant de panier, pour un panier sans article
 * d'une famille, ou pour certains points de retrait. Toutes en ET.
 *
 * Forme seule : l'ordre des heures, le montant entier, les jours distincts, les
 * conditions de panier réservées à l'emplacement panier et l'existence de la
 * famille et des points de retrait sont tenus par l'agrégat
 * `StaffSuggestionRule` et par les cas d'usage du commerce.
 */

/** Une plage d'heures locales (Paris), début compris, fin exclue, `HH:MM`. */
export const staffSuggestionHoursSchema = z.strictObject({
  from: z.string(),
  to: z.string(),
});
export type StaffSuggestionHours = z.infer<typeof staffSuggestionHoursSchema>;

/**
 * Les conditions d'une règle. `null` = la condition n'est pas posée.
 *
 * - `weekdays` : les jours de la semaine où elle vaut (au moins un) ;
 * - `hours` : la plage horaire où elle vaut, sans passer minuit ;
 * - `minCartTotalCents` : le total du panier, en centimes, tel que le client
 *   le lit au panier (HT au compte, TTC sinon), à partir duquel elle vaut ;
 * - `cartWithoutFamilyId` : elle ne vaut que si le panier n'a aucun article
 *   de cette famille (sous-familles comprises) ;
 * - `pickupAddressIds` : elle ne vaut qu'en retrait à l'un de ces points.
 */
export const staffSuggestionConditionsSchema = z.strictObject({
  weekdays: z.array(weekdaySchema).nullable(),
  hours: staffSuggestionHoursSchema.nullable(),
  minCartTotalCents: z.number().int().nullable(),
  cartWithoutFamilyId: z.string().nullable(),
  pickupAddressIds: z.array(z.string()).nullable(),
});
export type StaffSuggestionConditions = z.infer<typeof staffSuggestionConditionsSchema>;

/** Une règle sans condition : ce que vaut une règle d'avant RS8. */
export const NO_STAFF_SUGGESTION_CONDITIONS: StaffSuggestionConditions = {
  weekdays: null,
  hours: null,
  minCartTotalCents: null,
  cartWithoutFamilyId: null,
  pickupAddressIds: null,
};

/** Les jours dans l'ordre de la semaine française — lundi d'abord. */
export const STAFF_SUGGESTION_WEEKDAYS: readonly Weekday[] = weekdaySchema.options;
