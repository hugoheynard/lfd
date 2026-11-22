import { Prisma } from "../../../platform/database/client/client.js";
import { COMMERCIAL_INVOICE } from "../domain/entities/invoice.types.js";

/**
 * **La trace du virement sur les bons**, pour la facture d'alias `i` : le
 * virement que ses bons citent (`order_collection.bank_transfer_id`, posé ⇔
 * `settled_by_transfer`), ou `NULL`. Un bon n'est porté que par une facture
 * 380 (`invoice_order_invoiced_once`) : la trace d'un bon est celle de sa
 * facture, jamais d'un avoir qui le recite.
 *
 * C'est la facturation qui sait ce qu'elle a réglé : elle le lit sur ses
 * propres tables, sans lire celles du bloc `payment` (plan
 * `plan-le-virement-recu-dans-payment.md`, §7 n° 1).
 */
export const SETTLING_TRANSFER_OF_INVOICE_I = Prisma.sql`(
  SELECT oc."bank_transfer_id"
    FROM "public"."invoice_order" io
    JOIN "public"."order_collection" oc ON oc."order_id" = io."order_id"
   WHERE io."invoice_id" = i."id"
     AND io."invoice_type" = ${COMMERCIAL_INVOICE}
     AND oc."bank_transfer_id" IS NOT NULL
   ORDER BY oc."bank_transfer_id"
   LIMIT 1)`;
