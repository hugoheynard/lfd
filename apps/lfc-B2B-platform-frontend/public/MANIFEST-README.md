# `manifest.webmanifest` — pourquoi tout y est RELATIF

L'app cliente n'est pas servie à la racine. `lafoliecoffee.info/pro` est un
**chemin**, pas un sous-domaine : la passerelle porte le préfixe, et la
configuration de build `cloudflare` pose `baseHref: /pro/`.

Conséquence, et c'est le piège :

- `"start_url": "/"` serait résolu comme **racine absolue** — donc `/`, pas
  `/pro/`. Le lanceur de l'écran d'accueil ouvrirait la page d'accueil du site
  public au lieu de l'app, et `scope` ne couvrirait plus aucune de ses pages.
- `"./"` est résolu **contre l'URL du manifeste** : `/pro/` en production,
  `/` dans la coque Capacitor (`baseHref: /`) et en développement. Une seule
  écriture, juste dans les trois cas.

La même règle vaut pour les `src` des icônes (`brand/…`, sans barre initiale)
et pour le `href` du `<link rel="manifest">` dans `index.html`, qui se résout
contre le `<base>`.

`id` est volontairement **absent** : il vaut alors `start_url`, donc il suit le
préfixe tout seul. Écrit à la main, il devient la seule valeur absolue du
fichier — et l'identité de l'app installée casserait au premier changement de
chemin.
