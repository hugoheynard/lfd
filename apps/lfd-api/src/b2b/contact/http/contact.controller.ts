import {
  contactAudienceQuerySchema,
  type CustomerAudience,
  type PublicContactSettingsView,
  type PublicContactSubjectView,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetPublicContactSettingsQuery } from "../application/queries/get-public-contact-settings.query.js";
import { ListOfferedContactSubjectsQuery } from "../application/queries/list-offered-contact-subjects.query.js";

/**
 * Lecture **publique** de « Nous écrire » : la carte de contact, et les objets
 * qu'un public peut choisir. Comme `GET /order-opening` : surface anonyme,
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

  @Get("contact-subjects")
  subjects(
    @Query("audience", new ZodQuery(contactAudienceQuerySchema)) audience: CustomerAudience,
  ): Promise<PublicContactSubjectView[]> {
    return this.queries.execute<ListOfferedContactSubjectsQuery, PublicContactSubjectView[]>(
      new ListOfferedContactSubjectsQuery(audience),
    );
  }
}
