import { z } from "zod";

import { appointmentChannelSchema } from "../appointment.js";
import { empty, fact, instant, millicents, payload, ref, type JournalFactFamily } from "./fact.js";

/**
 * **Le commerce et le catalogue B2B** — ce qu'on vend aux pros (prix négocié,
 * vitrine, arrivée validée du référentiel), et le travail commercial (leads,
 * rendez-vous, recommandations du cockpit). Les faits commerciaux sont écrits
 * en best-effort par la croissance ; ceux du catalogue par `publishTraced`.
 */

/** Un prix B2B unitaire, en millicentimes. */
const price = () => payload({ priceMillicents: millicents() });

/** L'article dont on parle — le sujet est son SKU, la charge le répète. */
const skuOnly = () => payload({ sku: z.string() });

const LEAD_STATUSES = ["contacted", "qualified", "negotiating", "converted", "lost"] as const;
const PLAYS = ["lock_in", "rescue", "upgrade", "win_back", "nurture"] as const;

export const COMMERCE_FACTS = {
  "catalog_item.b2b_price_set": fact(
    payload({ sku: z.string(), before: price().nullable(), after: price() }),
  ),
  "catalog_item.b2b_price_cleared": fact(payload({ sku: z.string(), before: price() })),
  "catalog_item.hidden": fact(skuOnly()),
  "catalog_item.shown": fact(skuOnly()),
  "catalog_item.featured": fact(skuOnly()),
  "catalog_item.unfeatured": fact(skuOnly()),
  /** Une arrivée du référentiel validée, moins ses articles écartés. */
  "catalog_delivery.accepted": fact(
    payload({
      deliveryId: ref("catalog_delivery"),
      revisionId: ref("catalog_revision"),
      versionId: ref("catalog_version"),
      excludedSkus: z.array(z.string()),
    }),
  ),

  "lead.captured": fact(payload({ businessName: z.string(), email: z.string() })),
  "lead.stage_changed": fact(payload({ status: z.enum(LEAD_STATUSES) })),
  /** Converti à la main après rendez-vous, ou rapproché à l'inscription du client. */
  "lead.converted": fact(
    z.union([
      payload({ via: z.literal("manual") }),
      payload({ via: z.literal("registration"), linkedUserId: ref("user") }),
    ]),
  ),
  "lead.lost": fact(empty()),

  "appointment.requested": fact(
    payload({
      appointmentId: ref("appointment"),
      startAt: instant(),
      channel: appointmentChannelSchema,
    }),
  ),
  "appointment.confirmed": fact(
    payload({ appointmentId: ref("appointment"), startAt: instant(), via: z.literal("staff") }),
  ),
  /** Annulé par le client (sans motif), ou par le commercial (avec le sien). */
  "appointment.cancelled": fact(
    z.union([
      payload({ appointmentId: ref("appointment"), via: z.literal("customer") }),
      payload({ appointmentId: ref("appointment"), reason: z.string(), via: z.literal("staff") }),
    ]),
  ),
  /**
   * ⚠️ `reason` recopie le motif d'ANNULATION du rendez-vous (`cancelReason`),
   * sans objet pour ce geste — une clé à revoir au lot B.
   */
  "appointment.honored": fact(
    payload({ appointmentId: ref("appointment"), reason: z.string(), via: z.literal("staff") }),
  ),
  "appointment.no_show": fact(
    payload({ appointmentId: ref("appointment"), reason: z.string(), via: z.literal("staff") }),
  ),

  /** Une recommandation affichée au staff dans le cockpit — score sur 100. */
  "reco.shown": fact(payload({ play: z.enum(PLAYS), score: z.number().int() })),
} as const satisfies JournalFactFamily;
