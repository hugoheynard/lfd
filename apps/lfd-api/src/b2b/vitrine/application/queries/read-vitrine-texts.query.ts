import type { ContentLocale } from "@lfd/contracts";

/** Query : les textes effectifs de la boutique, dans une langue. */
export class ReadVitrineTextsQuery {
  constructor(
    readonly readKey: string | undefined,
    readonly language: ContentLocale,
  ) {}
}
