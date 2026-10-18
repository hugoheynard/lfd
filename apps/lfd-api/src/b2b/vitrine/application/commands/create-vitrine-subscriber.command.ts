import type { VitrineContent } from "@lfd/contracts";

/** Déclarer un abonné. Rend son id, son secret et sa clé — montrés une seule fois. */
export class CreateVitrineSubscriberCommand {
  constructor(
    readonly name: string,
    readonly endpointUrl: string,
    readonly contents: readonly VitrineContent[],
  ) {}
}
