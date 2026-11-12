import type { VitrineContent } from "@lfd/contracts";

/** Déclarer un abonné. Rend son id, son secret et sa clé — montrés une seule fois. */
export class CreateVitrineSubscriberCommand {
  constructor(
    readonly name: string,
    readonly endpointUrl: string | null,
    readonly contents: readonly VitrineContent[],
    /** À quoi sert l'abonné, pour le staff ; `null` si rien n'est dit. */
    readonly description: string | null,
    /** L'adresse où écrire à l'agence ; `null` si aucune. */
    readonly contactEmail: string | null,
    /** La fiche du staff qui déclare : l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran : un double clic ne déclare pas deux abonnés. */
    readonly intentKey: string,
  ) {}
}
