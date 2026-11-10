import type { ContentLocale } from "@lfd/contracts";

/** Query : la vue de l'agence, dans une langue, selon les cases de sa clé. */
export class ReadVitrineCatalogueQuery {
  constructor(
    readonly readKey: string | undefined,
    readonly language: ContentLocale,
  ) {}
}
