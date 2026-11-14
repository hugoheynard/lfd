# TODO — les restes du retrait de `/pro`

> État vérifié dans le code et dans Auth0 le 2026-11-14. La boutique est servie
> à la racine de `lafoliecoffee.info` (`<base href="/">`) ; `/pro` exact est
> l'accueil pro public, et seul `/pro/<chemin>` renvoie en 302 vers le même
> chemin sans préfixe (`redirectTo`, `gateway/src/index.ts`).
>
> Le contexte : [`../ci-cd/architecture-deploiement.md`](../ci-cd/architecture-deploiement.md),
> section « Le front client à la racine de `lafoliecoffee.info` ».

## La redirection de `/pro/…` reste en 302

Décidé avec Hugo le 2026-11-14 : pas de 301. `/pro` est devenu une vraie page ;
des pages sous `/pro/` pourront exister, et un 301 resterait gravé sans limite
dans le navigateur de chaque client qui l'a vu, les rendant inaccessibles. Un
302 ne coûte rien de plus ; seul le référencement d'anciennes adresses y
gagnerait, et il n'y en a pas.

## Auth0 : fait

L'application « La Folie Coffee E-commerce » n'autorise plus, dans ses trois
listes (Callback, Logout, Web Origins), que `http://localhost:7316`,
`http://127.0.0.1:7316` et `https://lafoliecoffee.info`. Retirés le 2026-11-14
avec l'accord de Hugo : `…/pro`, `lfc-b2b.pages.dev`, `lfc-b2b-eu7.pages.dev`
et `lfc-b2b.lafoliedouce.eu` (ces deux dernières ne résolvent plus). La
boutique envoie toujours `origin + base` (`app-base-url.ts`), donc
`https://lafoliecoffee.info` en production.

## La coque native vise la zone

`server.url` de la coque Capacitor (`apps/lfc-ecommerce-frontend/capacitor.config.ts`)
vise `https://lafoliecoffee.info` depuis le 2026-11-14. Rien n'est publié :
la ligne servira à la prochaine build de la coque, qui reste à faire (reconstruire
et signer l'app). Ouvrir la boutique directement sur `lfc-ecommerce.pages.dev`
ne permet pas de se connecter, et c'est voulu : une seule adresse publique.
