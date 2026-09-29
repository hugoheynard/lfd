/**
 * Port **d'aléa** des codes de bac (lot 4, L4-C20) : un tirage uniforme de six
 * caractères Crockford base 32. Jamais `Math.random()` (`lint:clock-port`) —
 * et jamais `IdGenerator`, dont les ULID sont MONOTONES : deux bacs déclarés
 * ensemble auraient des queues voisines.
 */
export abstract class BinCodeDrawer {
  abstract draw(): string;
}
