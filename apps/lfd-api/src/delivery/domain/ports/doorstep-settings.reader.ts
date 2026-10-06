import type { DoorstepRule } from "@lfd/contracts";

/**
 * Port de **lecture** du réglage global de la décision d'avance à la porte
 * (`a-la-porte.md`, B3 bis) : la règle posée, ou `null` si personne ne
 * l'a encore posée — l'appelant applique alors « Me demander ». Lu par
 * l'écran et par le départ, qui le résout avec l'adresse et le fige.
 */
export abstract class DoorstepSettingsReader {
  abstract current(): Promise<DoorstepRule | null>;
}
