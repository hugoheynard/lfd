/**
 * **Le contexte de vente qu'expose la boutique publique.**
 *
 * `takeaway` (Hugo, 2026-09-21 : « la boutique publique expose à emporter pour
 * le moment », D7). C'est une **valeur de donnée** — la clé sous laquelle le
 * référentiel range le prix public dans `public_by_context` — et pas un nom de
 * code : elle reste en anglais parce qu'elle voyage sur le fil.
 *
 * 🔴 **Elle a vécu en TROIS exemplaires le temps d'une journée**, et chaque
 * copie portait une justification de sa propre existence. Le lecteur de vente
 * promettait même « un seul endroit à changer ce jour-là », ce qui était faux
 * quelques heures plus tard ; l'écran de paramétrage assumait la duplication au
 * motif que les deux fichiers « répondent à deux questions ».
 *
 * C'était un mauvais argument : ils posent la MÊME question — quel contexte la
 * boutique publique sert-elle ? — et ils doivent y répondre pareil, sans quoi
 * l'écran de paramétrage montre un prix que la caisse n'applique pas. Une
 * duplication qu'on justifie deux fois de deux façons différentes est une
 * duplication qu'on n'a pas voulu regarder.
 *
 * ⚠️ **Le jour où le sur place arrive, il arrive par SON PROPRE CHEMIN** — une
 * porte de service de plus, pas une question greffée sur le retrait. Cette
 * constante deviendra alors une fonction du mode de service, et le fait qu'elle
 * soit seule est ce qui rendra ce jour-là tenable.
 *
 * Elle vit dans le **domaine** parce que c'est une règle de vente, pas un
 * détail de stockage : l'agrégat en a besoin pour refuser un prix public sur un
 * article que la vitrine n'expose pas.
 */
export const PUBLIC_SALES_CONTEXT = "takeaway";
