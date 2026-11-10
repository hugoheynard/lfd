/**
 * Préférences de **navigation/affichage** d'une personne — état UI, persisté
 * pour suivre le client d'un appareil à l'autre. Un sac extensible : la vue du
 * catalogue, l'espace de travail, demain d'autres réglages, sans migration.
 *
 * Une seule règle peut refuser une écriture : l'espace choisi doit être « perso »
 * ou une société de la personne ({@link assertWorkspaceWithinReach}). Le reste ne
 * protège rien ; on garantit seulement la **forme** en relecture (une valeur
 * inconnue retombe sur « aucun choix »), pour ne jamais renvoyer au front une
 * valeur qu'il ne saurait lire.
 */

/**
 * La forme vient des CONTRATS — elle était écrite trois fois : ici, dans les
 * contrats, et dans `legacy/catalogue` côté boutique. Trois listes de trois
 * mots à tenir d'accord, dont le commentaire d'origine disait déjà qu'elle
 * était « miroir de l'union front ». Un miroir qu'on entretient à la main
 * finit par renvoyer autre chose.
 *
 * Ce fichier garde ce qui lui appartient VRAIMENT : la garde de type et la
 * relecture défensive de la colonne JSON. Ça, c'est du comportement, et le
 * comportement ne descend pas dans un paquet de types.
 */
import { PERSONAL_WORKSPACE, type CatalogueView, type NavPreferences } from "@lfd/contracts";

import { WorkspaceOutOfReachError } from "../errors/account-errors.js";

export type { CatalogueView, NavPreferences };

export const CATALOGUE_VIEWS: readonly CatalogueView[] = ["cards", "shelves", "list"];

/** Aucune préférence encore posée. */
export const EMPTY_NAV_PREFERENCES: NavPreferences = { catalogueView: null, workspace: null };

/**
 * Ce qu'une écriture change : les seules clés présentes. Une clé absente n'est
 * pas touchée ; `workspace: null` efface le choix d'espace.
 */
export interface NavPreferencesPatch {
  readonly catalogueView?: CatalogueView;
  readonly workspace?: string | null;
}

/** Garde de type sur l'union des vues. */
export function isCatalogueView(value: unknown): value is CatalogueView {
  return typeof value === "string" && (CATALOGUE_VIEWS as readonly string[]).includes(value);
}

/**
 * Reconstruit des préférences **sûres** depuis la colonne JSON (type `unknown`
 * côté Prisma) : tout ce qui n'a pas la forme attendue devient « aucun choix ».
 * Aucune exception — une donnée d'affichage corrompue ne doit pas casser `/me`.
 *
 * L'espace n'est PAS confronté aux rattachements ici : une société quittée
 * depuis reste lue telle quelle, et c'est le front qui retombe sur son défaut.
 * Le serveur, lui, ne s'y fie jamais — il revérifie l'en-tête à chaque requête.
 */
export function parseNavPreferences(value: unknown): NavPreferences {
  if (value === null || typeof value !== "object") {
    return EMPTY_NAV_PREFERENCES;
  }
  const bag = value as Record<string, unknown>;
  const view = bag["catalogueView"];
  const workspace = bag["workspace"];
  return {
    catalogueView: isCatalogueView(view) ? view : null,
    workspace: typeof workspace === "string" && workspace !== "" ? workspace : null,
  };
}

/**
 * Refuse un espace qui n'est ni « perso » ni une société de la personne.
 *
 * Le refus ne protège pas un mur — l'en-tête est revérifié à chaque requête, et
 * une société étrangère y serait ignorée. Il empêche de **ranger** un choix que
 * le serveur ne servira jamais : le front le relirait à chaque visite, et
 * l'écran afficherait un espace que la vitrine et la caisse démentent.
 *
 * @throws {WorkspaceOutOfReachError} l'identifiant ne désigne aucun rattachement.
 */
export function assertWorkspaceWithinReach(
  workspace: string | null,
  companyIds: readonly string[],
): void {
  if (workspace === null || workspace === PERSONAL_WORKSPACE) {
    return;
  }
  if (!companyIds.includes(workspace)) {
    throw new WorkspaceOutOfReachError(workspace);
  }
}
