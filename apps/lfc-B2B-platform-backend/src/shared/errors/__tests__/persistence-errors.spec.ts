import { ResourceNotFoundError } from "../app-error.js";
import {
  DatabaseSchemaOutOfSyncError,
  DatabaseUnavailableError,
  DuplicateResourceError,
  mapPersistenceError,
  PersistedRecordNotFoundError,
  PersistenceError,
  RelatedResourceMissingError,
} from "../persistence-errors.js";

/** Fabrique une erreur Prisma factice (duck-typée par le mapper). */
function prismaError(name: string, code?: string): unknown {
  return { name, code, message: "erreur prisma factice" };
}

describe("mapPersistenceError", () => {
  it("laisse passer ce qui n'est pas une erreur Prisma (null)", () => {
    expect(mapPersistenceError(new Error("boom"))).toBeNull();
    expect(mapPersistenceError("boom")).toBeNull();
    expect(mapPersistenceError(null)).toBeNull();
  });

  it("colonne/table absente (P2022/P2021) → technique, schéma pas à jour", () => {
    const error = mapPersistenceError(prismaError("PrismaClientKnownRequestError", "P2022"));
    expect(error).toBeInstanceOf(DatabaseSchemaOutOfSyncError);
    expect(error?.category).toBe("technical");
    expect(mapPersistenceError(prismaError("PrismaClientKnownRequestError", "P2021"))).toBeInstanceOf(
      DatabaseSchemaOutOfSyncError,
    );
  });

  it("connexion/init (P1001, PrismaClientInitializationError) → technique, injoignable", () => {
    expect(mapPersistenceError(prismaError("PrismaClientKnownRequestError", "P1001"))).toBeInstanceOf(
      DatabaseUnavailableError,
    );
    expect(mapPersistenceError(prismaError("PrismaClientInitializationError"))).toBeInstanceOf(
      DatabaseUnavailableError,
    );
  });

  it("unicité (P2002) → business, doublon", () => {
    const error = mapPersistenceError(prismaError("PrismaClientKnownRequestError", "P2002"));
    expect(error).toBeInstanceOf(DuplicateResourceError);
    expect(error?.category).toBe("business");
  });

  it("clé étrangère (P2003) → business, référence manquante", () => {
    expect(mapPersistenceError(prismaError("PrismaClientKnownRequestError", "P2003"))).toBeInstanceOf(
      RelatedResourceMissingError,
    );
  });

  it("enregistrement absent (P2025) → 404 (ResourceNotFound)", () => {
    const error = mapPersistenceError(prismaError("PrismaClientKnownRequestError", "P2025"));
    expect(error).toBeInstanceOf(PersistedRecordNotFoundError);
    expect(error).toBeInstanceOf(ResourceNotFoundError);
  });

  it("code connu non listé, validation, panic → technique générique", () => {
    expect(mapPersistenceError(prismaError("PrismaClientKnownRequestError", "P2099"))).toBeInstanceOf(
      PersistenceError,
    );
    expect(mapPersistenceError(prismaError("PrismaClientValidationError"))).toBeInstanceOf(
      PersistenceError,
    );
  });

  it("préserve l'erreur d'origine dans `cause` (pour le log)", () => {
    const raw = prismaError("PrismaClientKnownRequestError", "P2002");
    expect(mapPersistenceError(raw)?.cause).toBe(raw);
  });
});
