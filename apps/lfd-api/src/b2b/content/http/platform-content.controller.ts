import type { FooterContentView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { GetFooterContentQuery } from "../application/get-footer-content.query.js";

/**
 * Lecture **publique** du pied de page — la vitrine en a besoin pour se rendre,
 * y compris avant toute connexion. Non sensible : ce sont les textes qu'on
 * publie, précisément.
 *
 * Surface anonyme ⇒ throttle resserré, sous le défaut global. L'écriture est
 * staff ({@link AdminPlatformContentController}).
 */
@Controller("content")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PlatformContentController {
  constructor(private readonly queries: QueryBus) {}

  @Get("footer")
  footer(): Promise<FooterContentView> {
    return this.queries.execute<GetFooterContentQuery, FooterContentView>(
      new GetFooterContentQuery(),
    );
  }
}
