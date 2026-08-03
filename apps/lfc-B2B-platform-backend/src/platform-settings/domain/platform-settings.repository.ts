import type { PlatformSettings } from "@lfd/contracts";

/**
 * Port des **réglages plateforme** — la config **globale** (singleton) qui pilote
 * les pièces d'activation. Une seule ligne en base ; le port l'expose comme un
 * objet valeur (`PlatformSettings`), sans fuir la notion de ligne.
 */
export abstract class PlatformSettingsRepository {
  /**
   * Lit la config. **Crée la ligne singleton aux défauts** si elle n'existe pas
   * encore (première lecture) — la table est vide juste après la migration.
   */
  abstract read(): Promise<PlatformSettings>;

  /** Remplace la config (tout ou rien — c'est un petit dictionnaire de modes). */
  abstract save(settings: PlatformSettings): Promise<void>;
}
