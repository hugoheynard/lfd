import { Logger } from "@nestjs/common";

import type { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import type { DocumentStore } from "../../../platform/storage/document-store.js";
import type { PaymentMandate } from "../domain/entities/payment-mandate.js";
import type { ProofPurgeCause } from "../domain/events/payment-mandate-facts.js";
import { MandateProofPurgedEvent } from "../domain/events/payment-mandate.events.js";

const LOGGER = new Logger("MandateProofPurge");

/** Les ports de la purge : le stockage qui détruit, le journal qui en témoigne. */
export interface ProofPurgeDeps {
  readonly store: DocumentStore;
  readonly events: DomainEventPublisher;
}

/** Le mandat dont la pièce part, tel que le journal le nomme. */
export interface ProofPurgeSubject {
  readonly id: string;
  readonly companyId: string;
  readonly reference: string;
}

/**
 * Détruit le scan d'un mandat **jamais signé**, puis l'écrit au journal.
 *
 * Plan `documentation/comptabilite/plan-restes-du-mandat.md` §4 et §7 #11 :
 *
 * - **À appeler APRÈS la validation** de l'unité de travail qui a rendu la pièce
 *   inutile. Un objet supprimé ne se restaure pas : supprimé avant un rollback,
 *   la base désignerait une pièce disparue ;
 * - **Ne lève jamais.** Le geste qui a précédé est déjà validé ; le faire
 *   échouer maintenant dirait « refusé » d'une écriture qui a eu lieu. Un échec
 *   de suppression va au journal applicatif, et l'objet reste orphelin — comme
 *   avant ce lot ;
 * - **Le fait n'est écrit qu'après une suppression réussie** : écrit avant, ou
 *   malgré l'échec, il dirait détruite une pièce toujours dans le bucket.
 *
 * La clé est au log et pas au fait : c'est elle qui permet de retrouver un
 * orphelin, et le journal métier n'a rien à faire d'un nom d'objet.
 */
export async function purgeProof(
  deps: ProofPurgeDeps,
  subject: ProofPurgeSubject,
  storageKey: string,
  cause: ProofPurgeCause,
): Promise<void> {
  try {
    await deps.store.delete(storageKey);
  } catch (error) {
    LOGGER.warn(
      `Scan du mandat ${subject.id} non supprimé (${cause}) — objet orphelin « ${storageKey} » : ${describe(error)}`,
    );
    return;
  }
  try {
    await deps.events.publishTraced(
      new MandateProofPurgedEvent(subject.id, subject.companyId, subject.reference, cause),
    );
  } catch (error) {
    // La pièce est partie : seul le témoin manque. Le dire fort, sans défaire
    // un geste déjà validé.
    LOGGER.error(
      `Scan du mandat ${subject.id} supprimé (${cause}), mais le fait n'a pas pu être journalisé : ${describe(error)}`,
    );
  }
}

/**
 * Purge le scan d'un brouillon **devenu caduc**, si l'agrégat l'autorise.
 *
 * La règle — jamais signé — est lue sur l'agrégat (`purgeableProofKey`), pas
 * refaite ici : un mandat qui aurait été actif garde sa pièce, quel que soit le
 * chemin qui l'amène jusqu'ici.
 */
export async function purgeVoidedDraftProof(
  deps: ProofPurgeDeps,
  voided: PaymentMandate,
): Promise<void> {
  const key = voided.purgeableProofKey();
  if (key !== null) {
    await purgeProof(deps, voided, key, "draft_voided");
  }
}

/**
 * Retire une pièce **que la base n'a jamais désignée** — rangée pour un dépôt
 * que l'écriture conditionnelle a refusé. Pas de fait : le mandat ne l'a jamais
 * portée, et le journal dirait « purgée » d'une pièce qu'il n'a jamais vu entrer.
 */
export async function discardUnrecordedProof(
  store: DocumentStore,
  mandateId: string,
  storageKey: string,
): Promise<void> {
  try {
    await store.delete(storageKey);
  } catch (error) {
    LOGGER.warn(
      `Scan refusé du mandat ${mandateId} non retiré — objet orphelin « ${storageKey} » : ${describe(error)}`,
    );
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name} ${error.message}` : String(error);
}
