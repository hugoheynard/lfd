import type { JournalEntry } from "../domain/ports/pricing-journal.reader.js";

/**
 * **Cette règle était-elle suspendue à cet instant ?** — d'après le journal, et
 * jamais d'après la règle d'aujourd'hui.
 *
 * 🔴 C'est la seule donnée de tout le dossier qu'une reprise **détruit** :
 * `PricingRule.resume()` remet `pausedAt` à `null`, et l'intervalle disparaît
 * avec lui. Une promotion suspendue le 12 et reprise le 13 se relirait donc « en
 * vigueur le 12 ». Le journal, lui, est append-only : la pause et la reprise y
 * sont deux actes datés, et c'est ce que le JSDoc de `isSuspended` annonçait
 * déjà — « cet intervalle vit dans le journal, qui est l'endroit fait pour ça ».
 *
 * Le dernier acte de suspension **avant** l'instant demandé décide : `paused`
 * sans `resumed` après lui signifie suspendue. Les actes arrivent du plus récent
 * au plus ancien, donc le premier qui compte est le premier trouvé.
 *
 * ⚠️ Ne lit que `paused` et `resumed`. Un acte inconnu d'une version future est
 * rangé en `posed` par le lecteur — l'ignorer ici est donc volontaire : mieux
 * vaut ne rien dire que déduire d'un verbe qu'on n'a pas compris.
 */
export function suspendedAt(entries: readonly JournalEntry[], at: Date): boolean {
  const decisive = entries
    .filter((entry) => entry.at.getTime() <= at.getTime())
    .filter((entry) => entry.kind === "paused" || entry.kind === "resumed")
    .sort((left, right) => right.at.getTime() - left.at.getTime())[0];
  return decisive?.kind === "paused";
}
