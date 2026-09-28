/**
 * **Un ULID tiré par l'écran** — 26 caractères de l'alphabet de Crockford :
 * 10 pour l'instant en millisecondes, 16 d'aléa.
 *
 * Écrit ici plutôt que tiré d'une dépendance : aucun front du dépôt n'en avait
 * (vérifié le 2026-09-28 — seul `lfd-api` dépend de `ulid`), et une fonction de
 * vingt lignes ne justifie pas un paquet de plus dans le bundle. L'aléa vient
 * de `crypto.getRandomValues`, jamais de `Math.random()`.
 *
 * Premier usage : la clé d'idempotence d'un contrôle qualité
 * (`plan-controle-qualite.md`, D8) — le même `id` rejoué rend le contrôle déjà
 * écrit au lieu d'en créer un second.
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;
const BASE = 32;

export function ulid(
  now: number = Date.now(),
  random: (length: number) => Uint8Array = (length) =>
    crypto.getRandomValues(new Uint8Array(length)),
): string {
  let time = '';
  let rest = Math.floor(now);
  for (let i = 0; i < TIME_LENGTH; i += 1) {
    time = CROCKFORD.charAt(rest % BASE) + time;
    rest = Math.floor(rest / BASE);
  }
  const bytes = random(RANDOM_LENGTH);
  let tail = '';
  for (const byte of bytes) {
    tail += CROCKFORD.charAt(byte % BASE);
  }
  return time + tail;
}
