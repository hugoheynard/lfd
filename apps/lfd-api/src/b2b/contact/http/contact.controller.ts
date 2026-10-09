import {
  contactAudienceQuerySchema,
  type CustomerAudience,
  type PublicContactSettingsView,
  type PublicRequestReasonView,
  requestKindQuerySchema,
  type RequestKind,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetPublicContactSettingsQuery } from "../application/queries/get-public-contact-settings.query.js";
import { ListOfferedRequestReasonsQuery } from "../application/queries/list-offered-request-reasons.query.js";

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

  /** Les numéros publiés et les textes des cartes, en un appel. */
  @Get("contact-settings")
  settings(): Promise<PublicContactSettingsView> {
    return this.queries.execute<GetPublicContactSettingsQuery, PublicContactSettingsView>(
      new GetPublicContactSettingsQuery(),
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
