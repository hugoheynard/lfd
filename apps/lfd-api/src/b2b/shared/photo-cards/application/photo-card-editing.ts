import type { StoredDocument } from "../../../../platform/storage/document-store.js";
import type { PhotoCardText } from "../domain/entities/photo-card-list.js";
import type { PhotoChange } from "../domain/value-objects/photo-change.js";
import type {
  InTransaction,
  OrphanPhotoReason,
  PhotoCardPorts,
  PhotoCardUsage,
} from "./photo-card-usage.js";

/**
 * **Les gestes sur des cartes à photo, sans mur.** L'appelant a déjà décidé du
 * droit d'agir et VALIDÉ le contenu et la photo (les types l'exigent : la
 * séquence reçoit des value objects, pas des octets) ; il fournit ce qui part
 * dans la transaction avec l'écriture.
 *
 * Extraite de la procédure de livraison le 2026-09-15 (plan
 * `documentation/b2b/plan-notes-photo-du-commercial.md`, D8) : la séquence et
 * son ordre ne s'écrivent qu'une fois pour les étapes et pour les notes.
 *
 * ## L'ordre des gestes est le sujet
 *
 * 1. **vérifier** la cible — rien ne part au stockage pour une cible refusée ;
 * 2. **ranger** la photo neuve sous une clé qui n'a jamais servi ;
 * 3. **verrouiller, puis charger, muter, sauver** en unité de travail — voir
 *    {@link serialized} ;
 * 4. **après** le commit seulement, supprimer l'ancienne photo.
 *
 * Si l'écriture échoue, la photo neuve est retirée (au mieux) : la base ne
 * pointe pas vers elle. Si la suppression de l'ancienne échoue, la requête
 * réussit quand même — un objet orphelin dans un bucket privé ne coûte rien, un
 * geste refusé pour ça coûterait à celui qui l'a fait.
 */

/** Une carte neuve, contenu et photo déjà validés. */
export interface NewPhotoCard<C extends PhotoCardText> {
  readonly content: C;
  readonly photo: StoredDocument | null;
}

/** Une révision, contenu et photo de remplacement déjà validés. */
export interface PhotoCardRevision<C extends PhotoCardText> {
  readonly content: C;
  readonly change: PhotoChange<StoredDocument>;
}

/** Ajoute une carte, avec sa photo s'il y en a une ; rend son id. */
export async function addPhotoCard<T, A, C extends PhotoCardText>(
  ports: PhotoCardPorts,
  usage: PhotoCardUsage<T, A, C>,
  target: T,
  card: NewPhotoCard<C>,
  inTransaction: InTransaction,
): Promise<string> {
  await usage.identity.ensure(target);

  const cardId = ports.ids.next();
  const photoKey =
    card.photo === null ? null : await storePhoto(ports, usage, target, cardId, card.photo);
  await writeOrDiscard(ports, usage, target, photoKey, async () => {
    const aggregate =
      (await usage.aggregates.load(target)) ?? usage.aggregates.open(target, ports.ids.next());
    usage.gestures.add(aggregate, cardId, card.content, photoKey);
    await usage.aggregates.save(aggregate);
    await inTransaction();
  });
  return cardId;
}

/** Refait une carte : contenu, et photo gardée, retirée ou remplacée. */
export async function revisePhotoCard<T, A, C extends PhotoCardText>(
  ports: PhotoCardPorts,
  usage: PhotoCardUsage<T, A, C>,
  target: T,
  cardId: string,
  revision: PhotoCardRevision<C>,
  inTransaction: InTransaction,
): Promise<void> {
  await usage.identity.ensure(target);

  const { change } = revision;
  const freshKey =
    change.kind === "replace" ? await storePhoto(ports, usage, target, cardId, change.photo) : null;
  const orphan = await writeOrDiscard(ports, usage, target, freshKey, async () => {
    const aggregate = await loadOrFail(usage, target, cardId);
    usage.gestures.revise(aggregate, cardId, revision.content);
    const previous = applyPhotoChange(usage, aggregate, cardId, change, freshKey);
    await usage.aggregates.save(aggregate);
    await inTransaction();
    return previous;
  });
  await discardQuietly(ports, usage, orphan, "replaced_or_removed");
}

/** Retire définitivement une carte, puis sa photo du stockage. */
export async function removePhotoCard<T, A, C extends PhotoCardText>(
  ports: PhotoCardPorts,
  usage: PhotoCardUsage<T, A, C>,
  target: T,
  cardId: string,
  inTransaction: InTransaction,
): Promise<void> {
  await usage.identity.ensure(target);
  const orphan = await serialized(ports, usage, target, async () => {
    const aggregate = await loadOrFail(usage, target, cardId);
    const photoKey = usage.gestures.remove(aggregate, cardId);
    await usage.aggregates.save(aggregate);
    await inTransaction();
    return photoKey;
  });
  await discardQuietly(ports, usage, orphan, "card_removed");
}

/** Range les cartes dans l'ordre donné — toutes, chacune une fois. */
export async function reorderPhotoCards<T, A, C extends PhotoCardText>(
  ports: PhotoCardPorts,
  usage: PhotoCardUsage<T, A, C>,
  target: T,
  cardIds: readonly string[],
  inTransaction: InTransaction,
): Promise<void> {
  await usage.identity.ensure(target);
  await serialized(ports, usage, target, async () => {
    const aggregate = await usage.aggregates.load(target);
    // Aucun agrégat : l'écran envoie l'ordre de cartes qui n'existent plus.
    if (aggregate === null) {
      throw usage.missing.orderStale();
    }
    usage.gestures.reorder(aggregate, cardIds);
    await usage.aggregates.save(aggregate);
    await inTransaction();
  });
}

/**
 * Exécute `work` en unité de travail, **sous le verrou de la cible**, pris en
 * première instruction de la transaction.
 *
 * Pourquoi : un `save` qui écrit l'état complet supprime les cartes ABSENTES de
 * l'agrégat chargé. Sans sérialisation, deux ajouts simultanés chargent chacun
 * l'état d'avant, et le second enregistrement efface la carte du premier (sa
 * photo reste alors orpheline). Le verrou couvre aussi deux créations
 * concurrentes de la racine, qu'un unique en base refuserait en 500.
 *
 * Le chargement vient APRÈS le verrou, dans `work` : en READ COMMITTED, chaque
 * instruction voit ce que la transaction concurrente a commité pendant
 * l'attente.
 */
function serialized<T, A, C extends PhotoCardText, R>(
  ports: PhotoCardPorts,
  usage: PhotoCardUsage<T, A, C>,
  target: T,
  work: () => Promise<R>,
): Promise<R> {
  return ports.uow.run(async () => {
    await usage.identity.lock(target);
    return work();
  });
}

/** Range la photo sous une clé neuve — la révision change à chaque dépôt. */
async function storePhoto<T, A, C extends PhotoCardText>(
  ports: PhotoCardPorts,
  usage: PhotoCardUsage<T, A, C>,
  target: T,
  cardId: string,
  photo: StoredDocument,
): Promise<string> {
  const key = usage.identity.photoKey(target, cardId, ports.ids.next());
  return ports.store.save(key, { bytes: photo.bytes, contentType: photo.contentType });
}

/** L'agrégat qui porte la carte ; sans agrégat, la carte est introuvable. */
async function loadOrFail<T, A, C extends PhotoCardText>(
  usage: PhotoCardUsage<T, A, C>,
  target: T,
  cardId: string,
): Promise<A> {
  const aggregate = await usage.aggregates.load(target);
  if (aggregate === null) {
    throw usage.missing.cardNotFound(cardId);
  }
  return aggregate;
}

/** Applique le changement de photo et rend la clé devenue orpheline. */
function applyPhotoChange<T, A, C extends PhotoCardText>(
  usage: PhotoCardUsage<T, A, C>,
  aggregate: A,
  cardId: string,
  change: PhotoChange<StoredDocument>,
  freshKey: string | null,
): string | null {
  if (change.kind === "remove") {
    return usage.gestures.detachPhoto(aggregate, cardId);
  }
  return freshKey === null ? null : usage.gestures.attachPhoto(aggregate, cardId, freshKey);
}

/** Écrit en unité de travail ; en cas d'échec, retire la photo qu'on venait de ranger. */
async function writeOrDiscard<T, A, C extends PhotoCardText, R>(
  ports: PhotoCardPorts,
  usage: PhotoCardUsage<T, A, C>,
  target: T,
  freshKey: string | null,
  work: () => Promise<R>,
): Promise<R> {
  try {
    return await serialized(ports, usage, target, work);
  } catch (error) {
    await discardQuietly(ports, usage, freshKey, "write_failed");
    throw error;
  }
}

/**
 * Supprime un objet du stockage **sans faire échouer la requête**. L'échec se
 * journalise : un objet orphelin dans un bucket privé ne fuit rien, et le geste
 * a déjà réussi en base.
 */
async function discardQuietly<T, A, C extends PhotoCardText>(
  ports: PhotoCardPorts,
  usage: PhotoCardUsage<T, A, C>,
  key: string | null,
  reason: OrphanPhotoReason,
): Promise<void> {
  if (key === null) {
    return;
  }
  try {
    await ports.store.delete(key);
  } catch (error) {
    usage.orphans.remained(reason, key, error instanceof Error ? error.stack : String(error));
  }
}
