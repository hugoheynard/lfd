import type { RoutingSettings } from "../value-objects/routing-settings.js";

/**
 * Port de **lecture** des réglages du calcul : ceux qu'on a posés, ou `null`
 * si personne n'a encore réglé — l'appelant prend alors les défauts.
 */
export abstract class RoutingSettingsReader {
  abstract current(): Promise<RoutingSettings | null>;
}
