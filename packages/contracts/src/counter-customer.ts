import { z } from "zod";

import { deliverySpecsSchema } from "./address.js";
import { companyMemberRoleSchema } from "./company-member.js";
import { companyStatusSchema } from "./customer-sheet.js";

/**
 * Contrat de fil du **Comptoir** : ce que le vendeur voit d'un client pour lui
 * vendre, et rien de plus (`documentation/order/plan-commande-au-comptoir.md`).
 *
 * Servi sous `b2b_counter:read`, jamais sous `b2b_companies` : la fiche client
 * — crédit accordé, KBIS, contacts, conditions — n'en fait pas partie. Un champ
 * ajouté ici s'ajoute donc à ce qu'un vendeur de comptoir lit de TOUS les
 * clients pros ; c'est la question à se poser avant de l'écrire.
 */

/**
 * La **carte de recherche** d'un client — une société `active`, seul statut qui
 * commande au prix pro. Ni propriétaire, ni e-mail, ni conditions.
 */
export const counterCustomerCardSchema = z.object({
  id: z.string().min(1),
  /** La raison sociale. */
  name: z.string(),
  /** L'enseigne — vide si la société n'en déclare pas. */
  tradeName: z.string(),
  reference: z.string(),
  siret: z.string(),
});
export type CounterCustomerCard = z.infer<typeof counterCustomerCardSchema>;

/** Un **acheteur** : un membre actif de la société, au nom de qui commander. */
export const counterCustomerBuyerSchema = z.object({
  userId: z.string().min(1),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  role: companyMemberRoleSchema,
});
export type CounterCustomerBuyer = z.infer<typeof counterCustomerBuyerSchema>;

/**
 * Une adresse de livraison du carnet, telle que la saisie en a besoin — la
 * même forme que `DeliveryAddressView`, pour que l'écran de commande consomme
 * les deux sources sans traduire.
 */
export const counterDeliveryAddressSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  ligne1: z.string(),
  ligne2: z.string(),
  codePostal: z.string(),
  ville: z.string(),
  pays: z.string(),
  isDefault: z.boolean(),
  specs: deliverySpecsSchema,
  procedureStepCount: z.number().int().nonnegative(),
});
export type CounterDeliveryAddress = z.infer<typeof counterDeliveryAddressSchema>;

/**
 * Le **détail** d'un client au comptoir.
 *
 * `settlesOnAccount` est calculé par le serveur, à partir de l'agrégat : le
 * comptoir n'a pas à lire le crédit accordé ni le blocage du prélèvement,
 * seulement à savoir s'il peut proposer « au compte ».
 */
export const counterCustomerViewSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  tradeName: z.string(),
  reference: z.string(),
  status: companyStatusSchema,
  settlesOnAccount: z.boolean(),
  /** Livraisons non archivées, la défaut en tête. */
  deliveryAddresses: z.array(counterDeliveryAddressSchema),
  buyers: z.array(counterCustomerBuyerSchema),
});
export type CounterCustomerView = z.infer<typeof counterCustomerViewSchema>;
