import { Injectable } from "@nestjs/common";

import { Clock } from "../time/clock.js";
import { type GestureIntent, GestureIntentLedger, type IntentRecord } from "./gesture-intent.js";
import {
  GestureInFlightError,
  IntentAlreadySealedError,
  IntentKeyReusedError,
  IntentRecordUnreadableError,
} from "./intent-errors.js";

/**
 * Comment le résultat d'un geste se range et se relit. Un codec plutôt qu'un
 * cast : un résultat gardé en base se VÉRIFIE à la relecture.
 */
export interface IntentCodec<R> {
  write(result: R): IntentRecord;
  read(record: IntentRecord, gesture: string): R;
}

/** L'intention est réclamée : le geste s'exécute. */
const NOT_REPLAYED = Symbol("not-replayed");

/** Le codec d'un geste qui ne rend rien. */
export const NOTHING_TO_REPLAY: IntentCodec<void> = {
  write: () => ({}),
  read: () => undefined,
};

/** Le codec d'un geste qui crée et rend l'identifiant de ce qu'il a créé. */
export const CREATED_ID_REPLAY: IntentCodec<string> = {
  write: (id) => ({ id }),
  read: (record, gesture) => readIntentString(record, "id", gesture),
};

/** Le codec d'un geste qui ne rend que « l'e-mail est-il parti ? ». */
export const MAIL_SENT_REPLAY: IntentCodec<{ readonly mailSent: boolean }> = {
  write: (result) => ({ mailSent: result.mailSent }),
  read: (record, gesture) => ({ mailSent: readIntentBoolean(record, "mailSent", gesture) }),
};

/** Lit un booléen gardé, ou lève une erreur technique nommée. */
export function readIntentBoolean(record: IntentRecord, field: string, gesture: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new IntentRecordUnreadableError(gesture, field);
  }
  return value;
}

/** Lit une chaîne gardée, ou lève une erreur technique nommée. */
export function readIntentString(record: IntentRecord, field: string, gesture: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new IntentRecordUnreadableError(gesture, field);
  }
  return value;
}

/** Lit une valeur gardée parmi celles admises, ou lève une erreur technique nommée. */
export function readIntentChoice<T extends string>(
  record: IntentRecord,
  field: string,
  gesture: string,
  choices: readonly T[],
): T {
  const value = record[field];
  const found = choices.find((choice) => choice === value);
  if (found === undefined) {
    throw new IntentRecordUnreadableError(gesture, field);
  }
  return found;
}

/**
 * **Exécuter un geste une fois par intention** (plan
 * `plan-service-e-mails.md`, revue, cas 4) : la mécanique de la passation
 * (`PlaceOrderHandler`), sortie du commerce.
 *
 * - intention neuve → le geste s'exécute, son résultat est gardé ;
 * - même intention, même geste, même sujet, aboutie → le résultat gardé est
 *   rendu, rien n'est réexécuté (ni le fournisseur d'identité, ni l'e-mail) ;
 * - même intention encore en vol → 409 nommé ;
 * - même clé sur un autre geste ou un autre sujet → 409 nommé.
 *
 * Un geste qui ÉCHOUE rend son intention : l'écran peut réessayer avec la
 * même clé, et l'essai suivant réexécute. Contrairement à la passation, ces
 * gestes sont rejouables par construction (l'ouverture d'accès est idempotente
 * sur l'adresse, l'e-mail l'est sur sa clé) : il n'y a pas de point de
 * non-retour à protéger.
 */
@Injectable()
export class OncePerIntent {
  constructor(
    private readonly ledger: GestureIntentLedger,
    private readonly clock: Clock,
  ) {}

  async run<R>(
    intent: GestureIntent,
    codec: IntentCodec<R>,
    gesture: () => Promise<R>,
  ): Promise<R> {
    const replayed = await this.claim(intent, codec);
    if (replayed !== NOT_REPLAYED) {
      return replayed.result;
    }
    let result: R;
    try {
      result = await gesture();
    } catch (error) {
      await this.ledger.release(intent);
      throw error;
    }
    await this.ledger.resolve(intent, codec.write(result), this.clock.now());
    return result;
  }

  /**
   * Comme {@link run}, pour un geste qui écrit en base : le geste reçoit
   * `seal`, qu'il appelle **dans sa propre unité de travail**, juste après son
   * écriture. Le résultat est alors gardé dans la même transaction que
   * l'écriture : une écriture validée a toujours son intention résolue, et le
   * bail expiré ne la laissera jamais réexécuter.
   *
   * Le geste garde la main sur la frontière de sa transaction : ses contrôles
   * préalables restent dehors, et elle ne s'ouvre que pour l'écriture.
   *
   * La réclamation reste HORS de toute transaction : c'est l'index unique qui
   * arbitre deux clics, un refus d'unicité dans une transaction l'annulerait
   * tout entière, et validée seule elle est vue de l'appel concurrent
   * (« en vol »). Un échec rend l'intention. Un geste qui n'a pas scellé (une
   * branche sans écriture) est résolu après coup, comme par {@link run}.
   */
  async runSealed<R>(
    intent: GestureIntent,
    codec: IntentCodec<R>,
    gesture: (seal: (result: R) => Promise<void>) => Promise<R>,
  ): Promise<R> {
    const replayed = await this.claim(intent, codec);
    if (replayed !== NOT_REPLAYED) {
      return replayed.result;
    }
    let sealed = false;
    const seal = async (result: R): Promise<void> => {
      // Un appel qui a repris l'intention après le bail a déjà scellé : lever
      // ici annule la transaction de celui-ci, et le geste ne s'écrit qu'une fois.
      if (!(await this.ledger.resolve(intent, codec.write(result), this.clock.now()))) {
        throw new IntentAlreadySealedError(intent.gesture);
      }
      sealed = true;
    };
    let result: R;
    try {
      result = await gesture(seal);
    } catch (error) {
      await this.ledger.release(intent);
      throw error;
    }
    if (!sealed) {
      await this.ledger.resolve(intent, codec.write(result), this.clock.now());
    }
    return result;
  }

  /** Réclame l'intention : refuse, rend le résultat gardé, ou laisse exécuter. */
  private async claim<R>(
    intent: GestureIntent,
    codec: IntentCodec<R>,
  ): Promise<{ readonly result: R } | typeof NOT_REPLAYED> {
    const claim = await this.ledger.claim(intent, this.clock.now());
    if (claim.kind === "mismatch") {
      throw new IntentKeyReusedError();
    }
    if (claim.kind === "in_flight") {
      throw new GestureInFlightError();
    }
    if (claim.kind === "replayed") {
      return { result: codec.read(claim.result, intent.gesture) };
    }
    return NOT_REPLAYED;
  }
}
