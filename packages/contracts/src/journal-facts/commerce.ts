import { z } from "zod";

import { appointmentChannelSchema } from "../appointment.js";
import {
  fact,
  instant,
  millicents,
  payload,
  ref,
  subjectLabel,
  type JournalFactFamily,
} from "./fact.js";

/**
 * **Le commerce et le catalogue B2B** — ce qu'on vend aux pros (prix négocié,
 * vitrine, arrivée validée du référentiel), et le travail commercial (leads,
 * rendez-vous, recommandations du cockpit). Les faits commerciaux sont écrits
 * en best-effort par la croissance ; ceux du catalogue par `publishTraced`.
 *
 * Lot B du plan des phrases (2026-09-19) : un fait porte le nom de son sujet
 * au moment du fait (`subjectLabel`, D6) — le nom de l'article, l'enseigne
 * d'un prospect. Les formes d'avant restent dans `history`.
 */

/**
 * Ajoute le nom du sujet à une charge, et garde la forme d'avant en historique :
 * la plupart des charges de la famille ont changé de cette seule façon.
 */
function labelled<S extends z.ZodRawShape>(shape: S) {
  return fact(payload({ subjectLabel: subjectLabel(), ...shape }), [payload(shape)]);
}

/** Un prix B2B unitaire, en millicentimes. */
const price = () => payload({ priceMillicents: millicents() });

/** L'article dont on parle — le sujet est son SKU, la charge le répète. */
const skuOnly = () => payload({ sku: z.string() });

const LEAD_STATUSES = ["contacted", "qualified", "negotiating", "converted", "lost"] as const;
const PLAYS = ["lock_in", "rescue", "upgrade", "win_back", "nurture"] as const;

export const COMMERCE_FACTS = {
  /** `subjectLabel` : le nom de l'article, tel que le référentiel l'avait livré. */
  "catalog_item.b2b_price_set": labelled({
    sku: z.string(),
    before: price().nullable(),
    after: price(),
  }),
  "catalog_item.b2b_price_cleared": labelled({ sku: z.string(), before: price() }),
  "catalog_item.hidden": labelled(skuOnly().shape),
  "catalog_item.shown": labelled(skuOnly().shape),
  "catalog_item.featured": labelled(skuOnly().shape),
  "catalog_item.unfeatured": labelled(skuOnly().shape),
  /**
   * Une arrivée du référentiel validée, moins ses articles écartés.
   *
   * ⚠️ Sans `subjectLabel`, et ses trois identifiants restent nus : ni une
   * arrivée, ni une révision, ni une version n'ont de nom — ce sont des
   * instantanés datés, que la ligne date déjà (lot B, 2026-09-19).
   */
  "catalog_delivery.accepted": fact(
    payload({
      deliveryId: ref("catalog_delivery"),
      revisionId: ref("catalog_revision"),
      versionId: ref("catalog_version"),
      excludedSkus: z.array(z.string()),
    }),
  ),

  /**
   * Un prospect saisi à la main. L'e-mail en est sorti le 2026-09-19 (lot B) :
   * une coordonnée n'a rien à faire au journal, et le lead la garde sur sa
   * propre ligne. `subjectLabel` : son enseigne — la même que `businessName`.
   */
  "lead.captured": fact(payload({ subjectLabel: subjectLabel(), businessName: z.string() }), [
    payload({ businessName: z.string(), email: z.string() }),
  ]),
  "lead.stage_changed": labelled({ status: z.enum(LEAD_STATUSES) }),
  /**
   * Converti à la main après rendez-vous, ou rapproché à l'inscription du client.
   * ⚠️ `linkedUserId` reste un identifiant nu : à l'inscription, la personne n'a
   * pas d'autre nom que son e-mail (lot B, 2026-09-19).
   */
  "lead.converted": fact(
    z.union([
      payload({ subjectLabel: subjectLabel(), via: z.literal("manual") }),
      payload({
        subjectLabel: subjectLabel(),
        via: z.literal("registration"),
        linkedUserId: ref("user"),
      }),
    ]),
    [
      z.union([
        payload({ via: z.literal("manual") }),
        payload({ via: z.literal("registration"), linkedUserId: ref("user") }),
      ]),
    ],
  ),
  "lead.lost": labelled({}),

  /**
   * Le sujet d'un rendez-vous est la société, à défaut la personne ou le
   * prospect. `subjectLabel` : le nom de la société, sinon le nom que le contact
   * a donné — absent quand ni l'un ni l'autre n'est connu.
   */
  "appointment.requested": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      appointmentId: ref("appointment"),
      startAt: instant(),
      channel: appointmentChannelSchema,
    }),
    [
      payload({
        appointmentId: ref("appointment"),
        startAt: instant(),
        channel: appointmentChannelSchema,
      }),
    ],
  ),
  "appointment.confirmed": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      appointmentId: ref("appointment"),
      startAt: instant(),
      via: z.literal("staff"),
    }),
    [payload({ appointmentId: ref("appointment"), startAt: instant(), via: z.literal("staff") })],
  ),
  /** Annulé par le client (sans motif), ou par le commercial (avec le sien). */
  "appointment.cancelled": fact(
    z.union([
      payload({
        subjectLabel: subjectLabel().optional(),
        appointmentId: ref("appointment"),
        via: z.literal("customer"),
      }),
      payload({
        subjectLabel: subjectLabel().optional(),
        appointmentId: ref("appointment"),
        reason: z.string(),
        via: z.literal("staff"),
      }),
    ]),
    [
      z.union([
        payload({ appointmentId: ref("appointment"), via: z.literal("customer") }),
        payload({ appointmentId: ref("appointment"), reason: z.string(), via: z.literal("staff") }),
      ]),
    ],
  ),
  /**
   * Plus de `reason` depuis le 2026-09-19 (lot B) : la clé recopiait le motif
   * d'ANNULATION du rendez-vous, sans objet pour ce geste — toujours vide.
   */
  "appointment.honored": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      appointmentId: ref("appointment"),
      via: z.literal("staff"),
    }),
    [payload({ appointmentId: ref("appointment"), reason: z.string(), via: z.literal("staff") })],
  ),
  "appointment.no_show": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      appointmentId: ref("appointment"),
      via: z.literal("staff"),
    }),
    [payload({ appointmentId: ref("appointment"), reason: z.string(), via: z.literal("staff") })],
  ),

  /**
   * Une recommandation affichée au staff dans le cockpit — score sur 100. Le
   * prospect est cité par son id (le sujet de la ligne) et, en
   * `subjectLabel`, par son NOM quand il en a un : l'enseigne d'une société ou
   * d'un prospect saisi, le prénom et le nom d'une personne. Jamais le libellé
   * du cockpit tel quel : pour une personne sans nom, c'est son e-mail
   * (`lead-score.ts`), et une coordonnée n'entre pas au journal (lot B,
   * 2026-09-19). La forme d'avant, sans libellé, se lit sous la courante.
   */
  "reco.shown": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      play: z.enum(PLAYS),
      score: z.number().int(),
    }),
  ),
} as const satisfies JournalFactFamily;
