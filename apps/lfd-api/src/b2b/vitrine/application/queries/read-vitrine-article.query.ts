import type { ContentLocale } from "@lfd/contracts";

/** Query : UN article de la vue de l'agence. */
export class ReadVitrineArticleQuery {
  constructor(
    readonly readKey: string | undefined,
    readonly sku: string,
    readonly language: ContentLocale,
  ) {}
}
