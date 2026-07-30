import { AppError, BusinessError, ResourceNotFoundError, TechnicalError } from "./app-error.js";

/**
 * Traduction des échecs de **persistance** (Prisma) en erreurs **catégorisées**.
 *
 * Une erreur Prisma brute ne doit jamais fuir : elle porte la stack, le nom des
 * colonnes, la version du client. On la rabat ici sur nos catégories — `technical`
 * pour un incident d'infra (base injoignable, schéma pas à jour), `business` pour
 * un refus légitime (doublon, référence manquante), `ResourceNotFound` pour un
 * enregistrement absent. Le filtre HTTP fait le reste (statut, masquage).
 *
 * Le mapping **duck-type** les erreurs Prisma (par `name` + `code`) plutôt que
 * d'importer le client généré : shared/ reste découplé de l'infra, et le chemin
 * du client custom ne fragilise pas ce module.
 */

/** La base de données est injoignable ou n'a pas pu s'initialiser. */
export class DatabaseUnavailableError extends TechnicalError {
  constructor(cause?: unknown) {
    super("persistence.database_unavailable", "La base de données est injoignable.", cause);
  }
}

/**
 * Le schéma en base ne correspond pas au code (table ou colonne absente) —
 * typiquement une **migration non déployée**. Incident d'infra, pas faute du client.
 */
export class DatabaseSchemaOutOfSyncError extends TechnicalError {
  constructor(cause?: unknown) {
    super(
      "persistence.schema_out_of_sync",
      "La base de données n'est pas à jour (migration manquante).",
      cause,
    );
  }
}

/** Échec de persistance non spécifiquement reconnu — filet technique. */
export class PersistenceError extends TechnicalError {
  constructor(reason: string, cause?: unknown) {
    super("persistence.failure", `Échec de persistance : ${reason}`, cause);
  }
}

/** Une contrainte d'unicité est violée (doublon). Refus **métier** (409). */
export class DuplicateResourceError extends BusinessError {
  constructor(cause?: unknown) {
    super("persistence.duplicate", "Cette ressource existe déjà.", cause);
  }
}

/** Une référence liée est absente (clé étrangère). Refus **métier** (409). */
export class RelatedResourceMissingError extends BusinessError {
  constructor(cause?: unknown) {
    super("persistence.related_missing", "Une ressource liée est introuvable.", cause);
  }
}

/** L'enregistrement visé n'existe pas (**404**). */
export class PersistedRecordNotFoundError extends ResourceNotFoundError {
  constructor(cause?: unknown) {
    super("persistence.record_not_found", "Ressource introuvable.", cause);
  }
}

/** Ce qu'on lit d'une erreur Prisma sans dépendre du client généré. */
interface PrismaErrorShape {
  readonly name: string;
  readonly code: string | null;
}

/** Duck-type une erreur Prisma (`name` commençant par `PrismaClient`), ou `null`. */
function prismaShapeOf(error: unknown): PrismaErrorShape | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const name: unknown = Reflect.get(error, "name");
  if (typeof name !== "string" || !name.startsWith("PrismaClient")) {
    return null;
  }
  const code: unknown = Reflect.get(error, "code");
  return { name, code: typeof code === "string" ? code : null };
}

/** Codes Prisma d'indisponibilité (connexion / initialisation). */
const UNAVAILABLE_CODES = new Set(["P1000", "P1001", "P1002", "P1008", "P1010", "P1011", "P1017"]);

/** Codes Prisma de schéma désynchronisé (table / colonne absente). */
const SCHEMA_CODES = new Set(["P2021", "P2022"]);

/**
 * Rabat une erreur **Prisma** sur une `AppError` catégorisée, ou renvoie `null`
 * si ce n'en est pas une (le filtre décidera alors du filet générique).
 */
export function mapPersistenceError(error: unknown): AppError | null {
  const shape = prismaShapeOf(error);
  if (shape === null) {
    return null;
  }
  if (shape.name === "PrismaClientInitializationError") {
    return new DatabaseUnavailableError(error);
  }
  if (shape.name !== "PrismaClientKnownRequestError") {
    // Validation, panic Rust, requête inconnue : un bug/incident, pas le client.
    return new PersistenceError("requête refusée par la base", error);
  }
  const code = shape.code;
  if (code === "P2002") {
    return new DuplicateResourceError(error);
  }
  if (code === "P2003") {
    return new RelatedResourceMissingError(error);
  }
  if (code === "P2025") {
    return new PersistedRecordNotFoundError(error);
  }
  if (code !== null && SCHEMA_CODES.has(code)) {
    return new DatabaseSchemaOutOfSyncError(error);
  }
  if (code !== null && UNAVAILABLE_CODES.has(code)) {
    return new DatabaseUnavailableError(error);
  }
  return new PersistenceError(`code ${code ?? "inconnu"}`, error);
}
