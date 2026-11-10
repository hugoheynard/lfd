/**
 * **Ce que la question autorise à PROUVER.**
 *
 * Un prix se résout sur des preuves : ce que le client a commandé (son
 * historique), ce qu'il a promis (son engagement). Toutes les questions n'ont
 * pas le droit de s'en servir — une projection manipule une hypothèse, pas une
 * commande —, et cette décision se prenait jusqu'ici en **trois endroits**
 * différents :
 *
 * - un booléen `measured` dans `LoadedPricer.resolve` ;
 * - la constante `NO_EVIDENCE`, qu'un appelant passait ou non ;
 * - un `commitments: []` monté à la main par l'écran de tarification.
 *
 * Trois encodages d'une seule décision, c'est-à-dire trois occasions de ne pas
 * dire la même chose. **C'est par cet éparpillement que R15 s'est glissé** : la
 * projection ouvrait la porte d'un plancher de marge sur une quantité qu'elle
 * avait inventée, et aucun des trois endroits ne pouvait le voir seul.
 *
 * ## Deux valeurs, nommées par ce qu'elles ADMETTENT
 *
 * Relevé le 2026-09-09, appelant par appelant :
 *
 * | Appelant      | Engagements | Historique |
 * | ------------- | ----------- | ---------- |
 * | la caisse     | ✓           | ✓          |
 * | la vitrine    | ✓           | ✓          |
 * | le tableau    | ✗           | ✗          |
 * | la projection | ✗           | ✗          |
 *
 * Deux configurations, donc deux valeurs. Une première rédaction en prévoyait
 * **trois** — elle donnait sa lentille au tableau, sous le nom `vitrine`, pour
 * une différence qui n'existe pas **au chargement** : le tableau et la
 * projection écartent exactement les mêmes preuves.
 *
 * ⚠️ Le nom compte. `checkout` / `screen` / `projection` désignent des
 * **scènes** : au cinquième appelant, on en invente une de plus, et le choix se
 * fait par ressemblance. `measured` / `unproven` désignent des **preuves
 * recevables** : un nouvel appelant se range en répondant à une question qu'il
 * peut trancher seul — _qu'est-ce que je suis en mesure de prouver ?_
 *
 * ## Ce que la lentille ne porte PAS
 *
 * **Ni la quantité, ni le client.** La vitrine ne diffère de la caisse que par
 * deux choses, et aucune n'est une preuve : elle résout à **1**, ce qui est un
 * argument de `price()`, et elle sert parfois un visiteur — ce que `companyId`
 * dit déjà, les lecteurs d'engagement et de mercuriale court-circuitant **sans
 * requête** quand il est nul.
 *
 * Lui faire porter `public` dirait donc une seconde fois ce que `companyId` dit,
 * et deux façons de dire la même chose finissent par ne plus dire la même chose.
 */
export type PriceLens = "measured" | "unproven";

/**
 * La question admet-elle les preuves qu'on pourrait mesurer ?
 *
 * Exportée plutôt que testée en ligne : le jour où une troisième lentille
 * apparaît, c'est ici qu'on décide de son camp, une fois, plutôt que dans chaque
 * `if` qui l'aurait supposée binaire.
 */
export function admitsEvidence(lens: PriceLens): boolean {
  return lens === "measured";
}
