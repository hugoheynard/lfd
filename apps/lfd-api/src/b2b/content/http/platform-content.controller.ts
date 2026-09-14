import type { FooterContentView, LegalDocumentView, LegalMention } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { GetFooterContentQuery } from "../application/get-footer-content.query.js";
import { GetLegalDocumentQuery } from "../application/get-legal-document.query.js";
import { LegalMentionParam } from "./legal-mention.pipe.js";

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

  /**
   * Le document d'une mention légale, lu par le dialogue de la boutique —
   * **paresseusement**, à la première ouverture. Public par nature : c'est ce
   * qu'on oppose au client, le cacher derrière un jeton n'aurait aucun sens.
   *
   * 🔴 La mention est validée contre le vocabulaire fermé, et une mention
   * inconnue rend **404**. Sur une surface anonyme, c'est aussi ce qui empêche
   * de sonder la table de contenu par son segment d'URL.
   */
  @Get("legal/:mention")
  legalDocument(
    @Param("mention", LegalMentionParam) mention: LegalMention,
  ): Promise<LegalDocumentView> {
    return this.queries.execute<GetLegalDocumentQuery, LegalDocumentView>(
      new GetLegalDocumentQuery(mention),
    );
  }
}
