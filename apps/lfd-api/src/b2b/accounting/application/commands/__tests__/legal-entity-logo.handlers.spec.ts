import { Buffer } from "node:buffer";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import {
  DocumentStore,
  type StoredDocument,
} from "../../../../../platform/storage/document-store.js";
import { DocumentStorageUnavailableError } from "../../../../../platform/shared/errors/storage-errors.js";
import { LegalEntity } from "../../../domain/entities/legal-entity.js";
import {
  EntityLogoUnreadableError,
  InvalidEntityLogoError,
  LegalEntityNotFoundError,
} from "../../../domain/errors/accounting-errors.js";
import { LegalEntityLogoReader } from "../../../domain/ports/legal-entity-logo.reader.js";
import { LegalEntityRepository } from "../../../domain/ports/legal-entity.repository.js";
import { LegalAddress } from "../../../domain/value-objects/legal-address.js";
import { Siren } from "../../../domain/value-objects/siren.js";
import { GetLegalEntityLogoHandler } from "../../queries/get-legal-entity-logo.handler.js";
import { GetLegalEntityLogoQuery } from "../../queries/legal-entity-queries.js";
import {
  RemoveLegalEntityLogoCommand,
  SetLegalEntityLogoCommand,
} from "../legal-entity-commands.js";
import { RemoveLegalEntityLogoHandler } from "../remove-legal-entity-logo.handler.js";
import { SetLegalEntityLogoHandler } from "../set-legal-entity-logo.handler.js";

const SIREN = "552100554";
const ENTITY_ID = "le1";

/** Un PNG 256 × 256 valide : en-tête complet, dimensions lisibles. */
const PNG = pngOf(256, 256);

/** Dépôt en mémoire : il rend l'agrégat, il n'écrit pas de colonnes. */
class InMemoryEntities extends LegalEntityRepository {
  readonly rows = new Map<string, LegalEntity>();

  load(id: string): Promise<LegalEntity | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  save(entity: LegalEntity): Promise<void> {
    this.rows.set(entity.id, entity);
    return Promise.resolve();
  }
}

/**
 * Stockage en mémoire, **fidèle au contrat du port** : `read` traite l'absence
 * en panne, `readIfPresent` la traite en réponse. Un doublé qui confondrait les
 * deux laisserait passer précisément le bug que la distinction évite.
 */
class InMemoryStore extends DocumentStore {
  readonly objects = new Map<string, StoredDocument>();

  save(key: string, document: StoredDocument): Promise<string> {
    this.objects.set(key, document);
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    if (found === undefined) {
      return Promise.reject(new DocumentStorageUnavailableError(`« ${key} » est absent.`));
    }
    return Promise.resolve(found.bytes);
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(key)?.bytes ?? null);
  }
}

/** Stockage en panne — ce qu'un bucket mal nommé fait vraiment. */
class BrokenStore extends DocumentStore {
  save(): Promise<string> {
    return Promise.reject(new DocumentStorageUnavailableError("bucket introuvable."));
  }

  read(): Promise<Buffer> {
    return Promise.reject(new DocumentStorageUnavailableError("bucket introuvable."));
  }

  readIfPresent(): Promise<Buffer | null> {
    return Promise.reject(new DocumentStorageUnavailableError("bucket introuvable."));
  }
}

/** Lecture de la clé, adossée au dépôt : les deux ne peuvent pas diverger. */
class EntitiesLogoReader extends LegalEntityLogoReader {
  constructor(private readonly entities: InMemoryEntities) {
    super();
  }

  logoKeyOf(legalEntityId: string): Promise<string | null> {
    return Promise.resolve(this.entities.rows.get(legalEntityId)?.logoKey ?? null);
  }
}

function sampleEntity(id = ENTITY_ID): LegalEntity {
  return LegalEntity.declare({
    id,
    name: "La Folie Douce",
    legalForm: "SAS",
    siren: Siren.create(SIREN),
    address: LegalAddress.create({
      line1: "12 rue du Fournil",
      line2: "",
      postalCode: "73000",
      city: "Chambéry",
      countryCode: "FR",
    }),
    rcs: "",
    shareCapitalCents: 1_000_000,
    vatNumber: "",
  });
}

function seeded(): InMemoryEntities {
  const entities = new InMemoryEntities();
  const entity = sampleEntity();
  entities.rows.set(entity.id, entity);
  return entities;
}

describe("SetLegalEntityLogoHandler", () => {
  it("valide, range, puis attache la clé à l'agrégat", async () => {
    const entities = seeded();
    const store = new InMemoryStore();
    const handler = new SetLegalEntityLogoHandler(entities, store, new DirectUnitOfWork());

    await handler.execute(new SetLegalEntityLogoCommand(ENTITY_ID, "logo.png", PNG));

    const stored = entities.rows.get(ENTITY_ID);
    expect(stored?.hasLogo).toBe(true);
    // La clé est ancrée sur l'ENTITÉ : c'est le mur du stockage, et il est dans
    // le chemin. Aucune donnée reçue n'y entre.
    expect(stored?.logoKey).toBe(`legal-entities/${ENTITY_ID}/logo`);
    expect(store.objects.get(`legal-entities/${ENTITY_ID}/logo`)?.contentType).toBe("image/png");
  });

  it("REFUSE avant de ranger quoi que ce soit — on ne stocke jamais un fichier douteux", async () => {
    const entities = seeded();
    const store = new InMemoryStore();
    const handler = new SetLegalEntityLogoHandler(entities, store, new DirectUnitOfWork());

    await expect(
      handler.execute(
        new SetLegalEntityLogoCommand(ENTITY_ID, "faux.png", Buffer.from("%PDF-1.4", "latin1")),
      ),
    ).rejects.toThrow(InvalidEntityLogoError);

    expect(store.objects.size).toBe(0);
    expect(entities.rows.get(ENTITY_ID)?.hasLogo).toBe(false);
  });

  it("remplace à la MÊME clé — un remplacement reste un remplacement", async () => {
    const entities = seeded();
    const store = new InMemoryStore();
    const handler = new SetLegalEntityLogoHandler(entities, store, new DirectUnitOfWork());

    await handler.execute(new SetLegalEntityLogoCommand(ENTITY_ID, "logo.png", PNG));
    await handler.execute(new SetLegalEntityLogoCommand(ENTITY_ID, "autre.png", pngOf(300, 300)));

    expect(store.objects.size).toBe(1);
  });

  it("404 sur une entité inconnue", async () => {
    const handler = new SetLegalEntityLogoHandler(
      new InMemoryEntities(),
      new InMemoryStore(),
      new DirectUnitOfWork(),
    );

    await expect(
      handler.execute(new SetLegalEntityLogoCommand("inexistante", "logo.png", PNG)),
    ).rejects.toThrow(LegalEntityNotFoundError);
  });

  /**
   * Le stockage qui refuse ne doit pas laisser une clé en base : la base
   * pointerait alors vers un objet qui n'est jamais arrivé, et le défaut ne se
   * verrait qu'à l'impression d'un mandat.
   */
  it("n'attache RIEN quand le stockage refuse", async () => {
    const entities = seeded();
    const handler = new SetLegalEntityLogoHandler(
      entities,
      new BrokenStore(),
      new DirectUnitOfWork(),
    );

    await expect(
      handler.execute(new SetLegalEntityLogoCommand(ENTITY_ID, "logo.png", PNG)),
    ).rejects.toThrow(DocumentStorageUnavailableError);
    expect(entities.rows.get(ENTITY_ID)?.hasLogo).toBe(false);
  });

  it("n'entre PAS dans missingToCollect — une entité sans logo prélève", () => {
    const entities = seeded();
    const entity = entities.rows.get(ENTITY_ID);

    expect(entity?.missingToCollect()).not.toContain("le logo de l'entité");
    expect(entity?.missingToCollect()).toHaveLength(2);
  });
});

describe("RemoveLegalEntityLogoHandler", () => {
  it("détache la clé et laisse l'objet rangé — la base est seule autorité", async () => {
    const entities = seeded();
    const store = new InMemoryStore();
    await new SetLegalEntityLogoHandler(entities, store, new DirectUnitOfWork()).execute(
      new SetLegalEntityLogoCommand(ENTITY_ID, "logo.png", PNG),
    );

    await new RemoveLegalEntityLogoHandler(entities, new DirectUnitOfWork()).execute(
      new RemoveLegalEntityLogoCommand(ENTITY_ID),
    );

    expect(entities.rows.get(ENTITY_ID)?.hasLogo).toBe(false);
    expect(store.objects.size).toBe(1);
  });

  it("404 sur une entité inconnue", async () => {
    await expect(
      new RemoveLegalEntityLogoHandler(new InMemoryEntities(), new DirectUnitOfWork()).execute(
        new RemoveLegalEntityLogoCommand("inexistante"),
      ),
    ).rejects.toThrow(LegalEntityNotFoundError);
  });
});

describe("GetLegalEntityLogoHandler", () => {
  it("rend les octets et le type RELU dans les octets", async () => {
    const entities = seeded();
    const store = new InMemoryStore();
    await new SetLegalEntityLogoHandler(entities, store, new DirectUnitOfWork()).execute(
      new SetLegalEntityLogoCommand(ENTITY_ID, "logo.png", PNG),
    );

    const logo = await new GetLegalEntityLogoHandler(
      new EntitiesLogoReader(entities),
      store,
    ).execute(new GetLegalEntityLogoQuery(ENTITY_ID));

    expect(logo?.contentType).toBe("image/png");
    expect(logo?.bytes.equals(PNG)).toBe(true);
  });

  it("rend null quand l'entité n'a pas de logo — une absence, pas une panne", async () => {
    const logo = await new GetLegalEntityLogoHandler(
      new EntitiesLogoReader(seeded()),
      new InMemoryStore(),
    ).execute(new GetLegalEntityLogoQuery(ENTITY_ID));

    expect(logo).toBeNull();
  });

  /**
   * 🔴 Une panne du stockage ne doit PAS devenir « pas de logo ». Un bucket mal
   * nommé rendrait sinon toutes les entités sans logo, et le symptôme d'un
   * stockage cassé serait l'absence de symptôme.
   */
  it("laisse remonter une panne du stockage au lieu de la traduire en absence", async () => {
    const entities = seeded();
    const entity = entities.rows.get(ENTITY_ID);
    entity?.attachLogo(`legal-entities/${ENTITY_ID}/logo`);

    await expect(
      new GetLegalEntityLogoHandler(new EntitiesLogoReader(entities), new BrokenStore()).execute(
        new GetLegalEntityLogoQuery(ENTITY_ID),
      ),
    ).rejects.toThrow(DocumentStorageUnavailableError);
  });

  it("refuse en panne des octets rangés qui ne sont plus une image", async () => {
    const entities = seeded();
    const entity = entities.rows.get(ENTITY_ID);
    const key = `legal-entities/${ENTITY_ID}/logo`;
    entity?.attachLogo(key);
    const store = new InMemoryStore();
    // Un objet remplacé EN DEHORS du produit : seul `EntityLogo` a pu écrire
    // ici, donc ce cas signale que bucket et base ne racontent plus la même
    // chose. Il doit se voir, pas se rattraper en servant du vide.
    store.objects.set(key, {
      bytes: Buffer.from("%PDF-1.4", "latin1"),
      contentType: "image/png",
    });

    await expect(
      new GetLegalEntityLogoHandler(new EntitiesLogoReader(entities), store).execute(
        new GetLegalEntityLogoQuery(ENTITY_ID),
      ),
    ).rejects.toThrow(EntityLogoUnreadableError);
  });
});

/** Un PNG réel : signature, IHDR aux dimensions demandées, IDAT, IEND. */
function pngOf(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  return Buffer.concat([signature, chunkOf("IHDR", header), chunkOf("IEND", Buffer.alloc(0))]);
}

function chunkOf(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
}
