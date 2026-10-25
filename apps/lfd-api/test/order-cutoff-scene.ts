import { instantToLocal, localToInstant, type LocalMoment } from "@lfd/contracts";

const MINUTE_MS = 60_000;

/** Une limite de commande posée en heure de Paris, et le rattrapage qui la suit. */
export interface PassedLimit extends LocalMoment {
  readonly graceMinutes: number;
}

/**
 * Une limite tombée il y a `minutesAgo`, avec `graceMinutes` de rattrapage —
 * traduite en heure de PARIS **qui désigne bien cet instant-là**.
 *
 * 🔴 La nuit du passage à l'heure d'hiver, 02:00–03:00 existe deux fois, et la
 * résolution d'une règle retient la première occurrence (`localToInstant`).
 * Une limite lue à 02:30 heure d'hiver se relisait donc une heure plus tôt :
 * le rattrapage était clos, `grace` devenait `past` (constaté le 2026-10-25,
 * en local et en CI, rouge de 02:00 à 03:15, vert à 03:16).
 *
 * On recule alors la limite, minute par minute, jusqu'à une heure qui se relit
 * exactement, et on allonge le rattrapage d'autant : la FIN du rattrapage reste
 * le même instant, et la limite reste dans le passé — la scène affirme la même
 * chose, à toute heure de l'année.
 */
export function passedLimit(now: Date, minutesAgo: number, graceMinutes: number): PassedLimit {
  const wanted = Math.floor((now.getTime() - minutesAgo * MINUTE_MS) / MINUTE_MS) * MINUTE_MS;
  for (let shift = 0; ; shift += 1) {
    const local = instantToLocal(new Date(wanted - shift * MINUTE_MS));
    if (localToInstant(local.day, local.time)?.getTime() === wanted - shift * MINUTE_MS) {
      return { ...local, graceMinutes: graceMinutes + shift };
    }
  }
}
