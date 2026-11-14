# `manifest.webmanifest` — pourquoi tout y est RELATIF

L'app cliente est servie à la racine de `lafoliecoffee.info` (`baseHref: /`).
Le manifeste n'écrit pourtant aucun chemin absolu : un chemin relatif suit
l'app là où elle est servie, sans une ligne à changer si elle change de
préfixe.

- `"./"` (`start_url`, `scope`) est résolu **contre l'URL du manifeste** : la
  racine en production, dans la coque Capacitor et en développement. Un
  `"/"` écrit en dur ne vaudrait que tant que l'app reste à la racine.
- La même règle vaut pour les `src` des icônes (`brand/…`, sans barre
  initiale) et pour le `href` du `<link rel="manifest">` dans `index.html`,
  qui se résout contre le `<base>`.

`id` est volontairement **absent** : il vaut alors `start_url`, donc il suit le
chemin tout seul. Écrit à la main, il deviendrait la seule valeur absolue du
fichier — et l'identité de l'app installée casserait au premier changement de
chemin.

L'app reste **installable** (manifeste, icônes 192/512 `any maskable`,
`apple-touch-icon`) ; aucun bandeau ne propose de l'installer.
