import {
  contactAudienceQuerySchema,
  type CustomerAudience,
  type AudienceContactSettingsView,
  type PublicRequestReasonView,
  requestKindQuerySchema,
  type RequestKind,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetShopContactSettingsQuery } from "../application/queries/get-shop-contact-settings.query.js";
import { ListOfferedRequestReasonsQuery } from "../application/queries/list-offered-request-reasons.query.js";

/**
 * `?audience=pro` — la SEULE valeur admise (vitrine pro). Absent = les
 * particuliers. Toute autre valeur est refusée (400) plutôt que ramenée aux
 * particuliers : une faute de frappe ne doit pas servir en silence une autre carte.
 */
const settingsAudienceSchema = z.enum(["pro"]).optional();

/**
 * Lecture **publique** des demandes clients : la carte de contact, et les
 * motifs qu'un formulaire propose à un public. Comme `GET /order-opening` : surface anonyme,
 * throttle resserré (60/min/IP).
 */
@Controller()
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class ContactController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * La carte d'UNE audience déclarée et ses numéros — particuliers par défaut,
   * pros avec `?audience=pro` — jamais celle de l'autre public (Hugo,
   * 2026-11-01). Un client connecté lit la sienne par `GET /me/contact-settings`.
   */
  @Get("contact-settings")
  settings(
    @Query("audience", new ZodQuery(settingsAudienceSchema)) audience: "pro" | undefined,
  ): Promise<AudienceContactSettingsView> {
    return this.queries.execute<GetShopContactSettingsQuery, AudienceContactSettingsView>(
      new GetShopContactSettingsQuery(audience === "pro" ? "b2b" : "b2c"),
    );
  }

  /** `GET /request-reasons?kind=&audience=` — remplace `GET /contact-subjects` (§6.7). */
  @Get("request-reasons")
  reasons(
    @Query("kind", new ZodQuery(requestKindQuerySchema)) kind: RequestKind,
    @Query("audience", new ZodQuery(contactAudienceQuerySchema)) audience: CustomerAudience,
  ): Promise<PublicRequestReasonView[]> {
    return this.queries.execute<ListOfferedRequestReasonsQuery, PublicRequestReasonView[]>(
      new ListOfferedRequestReasonsQuery(kind, audience),
    );
  }
}
