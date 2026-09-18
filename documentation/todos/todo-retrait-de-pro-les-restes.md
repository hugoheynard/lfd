# TODO — les restes du retrait de `/pro`

> **État au 2026-09-15** : la boutique est servie à la racine de
> `lafoliecoffee.info` (merge `0bd889b4`), `/pro/…` renvoie en 302 vers le même
> chemin sans préfixe, et la connexion Auth0 à la racine est **vérifiée par
> Hugo**. Ce qui suit n'est pas urgent : ce sont les gestes qu'on a
> délibérément laissés pour plus tard.
>
> Le contexte : [`../ci-cd/architecture-deploiement.md`](../ci-cd/architecture-deploiement.md),
> section « Le front client à la racine de `lafoliecoffee.info` ».

## 1. Passer la redirection de `/pro` en 301

**Quand** : après quelques jours de racine en production sans incident.

**Pourquoi pas tout de suite** : un 301 se garde en cache **sans limite** dans
le navigateur de chaque client. Si la racine devait être abandonnée, un 302 se
défait en un déploiement ; un 301 laisserait des clients renvoyés vers une
adresse morte jusqu'à ce qu'ils vident leur cache.

**Le geste** : `status: 302` → `301` dans `redirectTo`
(`gateway/src/index.ts`), et le JSDoc qui justifie le 302 à réécrire.

## 2. Retirer les adresses en `/pro` d'Auth0

**Quoi** : `https://lafoliecoffee.info/pro` dans les **Allowed Callback URLs** et
les **Allowed Logout URLs** de l'application Auth0 de la boutique. Geste dans le
tableau de bord Auth0, pas dans le dépôt.

**Quand** : une fois sûr que plus rien ne s'y connecte. Un onglet ouvert avant
le déploiement, ou une coque native pointée sur l'ancienne adresse, enverrait
encore `redirect_uri=…/pro` — refusé par Auth0 dès l'adresse retirée.

**Vérifier avant** : la coque Capacitor (`apps/lfc-B2B-platform-frontend/capacitor.config.ts`,
`server.url`) pointe encore sur `lfc-b2b-eu7.pages.dev` et non sur la zone ;
elle n'est donc pas concernée tant qu'elle n'a pas basculé (§3).

## 3. Basculer la coque native sur la zone

`server.url` de la coque Capacitor vise toujours l'adresse du projet Pages. Le
commentaire du fichier prévoit de la faire pointer sur `https://lafoliecoffee.info`
— la racine, désormais, et non plus `/pro`. À faire avec la prochaine build de
la coque, et à vérifier contre les URL Auth0 du §2.
