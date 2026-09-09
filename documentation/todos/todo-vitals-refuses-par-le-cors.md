# Les web vitals sont refusés par le CORS, sur les DEUX fronts

**Ouvert le 2026-09-09**, en diagnostiquant une erreur de console signalée sur
`lfd-backoffice.pages.dev`. 🔴 Dette **active** : la mesure ne remonte pas, et
personne ne le savait — un envoi qui échoue en silence est indistinguable d'un
front qui n'a rien à dire.

## Le symptôme, et ce qu'il coûte

```
Access to resource at 'https://lfd-gateway.lafoliedouce.workers.dev/api/lfd/ops/vitals'
from origin 'https://lfd-backoffice.pages.dev' has been blocked by CORS policy:
The value of the 'Access-Control-Allow-Credentials' header in the response is ''
which must be 'true' when the request's credentials mode is 'include'.
```

Ce n'est pas un bruit de console. `ops/vitals` alimente `vitalsReadings`, donc
les compteurs de `/health` et l'écran de santé. **Ils mesurent zéro depuis que
le mécanisme existe**, et zéro échantillon ressemble à « tout va bien ».

⚠️ Ça touche `packages/front-ops`, donc **la boutique autant que le
back-office** — le diagnostic est parti d'une console d'admin, la panne est
commune.

## La cause : deux lignes qui ne se connaissent pas

```ts
// apps/lfd-api/src/main.ts:53 — pas de `credentials`
app.enableCors({ origin: config.isProduction() ? PROD_CORS_ORIGINS : DEV_CORS_ORIGINS });

// packages/front-ops/src/web-vitals.ts:64
navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
```

`navigator.sendBeacon` envoie **toujours** en mode credentials `include` en
cross-origin, et l'appelant ne peut pas le lui retirer. Le type
`application/json` n'étant pas dans la liste sûre du CORS, la requête déclenche
un préflight — que le serveur honore **sans** `Access-Control-Allow-Credentials`,
puisque personne ne le lui a demandé.

Aucune des deux lignes n'est fautive isolément. C'est leur rencontre qui l'est,
et elle ne se voit dans aucun des deux fichiers.

**Mesuré le 2026-09-09** sur la production déployée :

```
OPTIONS /api/lfd/ops/vitals   Origin: https://lfd-backoffice.pages.dev
→ HTTP/2 204
  access-control-allow-origin: https://lfd-backoffice.pages.dev     ✓
  access-control-allow-methods: GET,HEAD,PUT,PATCH,POST,DELETE      ✓
  (aucun access-control-allow-credentials)                          ✗
```

L'origine est bien dans l'allowlist : le registre `@lfd/endpoints` porte
`b2bAdminFront: "https://lfd-backoffice.pages.dev"`. Ce n'est pas la bascule de
projet Pages que le runbook signale en rouge — cette hypothèse-là a été ouverte
et écartée.

## La sortie : ② — et surtout pas ①

### ① `credentials: true` sur `enableCors` — à ne pas faire

Une ligne, et ça marche. C'est exactement pour ça qu'il faut l'écarter : ça
**élargit une frontière de sécurité pour faire passer de la télémétrie**.

Le backend n'a aujourd'hui **aucune authentification par cookie** — tout passe
par le jeton Auth0 (vérifié le 2026-09-09 : rien dans `platform/auth/` ni dans
`main.ts` ne pose ou ne lit de cookie). Le risque est donc nul _aujourd'hui_, et
c'est précisément le piège : la ligne resterait, muette, et le jour où quelqu'un
ajoutera une session par cookie il héritera d'une surface CSRF que personne
n'aura décidé d'ouvrir.

### ② `fetch` avec `keepalive`, sans identifiants

```ts
void fetch(endpoint, {
  method: "POST",
  keepalive: true,
  credentials: "omit",
  headers: { "content-type": "application/json" },
  body,
}).catch(() => {});
```

`ops/vitals` est **la seule route publique d'OPS** (`ops.module.ts` le dit) :
elle n'a aucune raison de recevoir des identifiants. En les omettant, le
préflight passe sans que le CORS bouge d'un pouce.

`keepalive` tient la garantie pour laquelle `sendBeacon` avait été choisi — le
JSDoc l'écrit : « il survit à la fermeture de l'onglet, là où `fetch` est
annulé ». C'est vrai d'un `fetch` ordinaire, **pas** d'un `fetch` en
`keepalive`, qui est le mécanisme dont `sendBeacon` est le raccourci. La limite
des 64 Ko est sans objet : le corps porte trois mesures.

## Ce que ça demande

- une modification dans `packages/front-ops` ;
- 🔴 **le redéploiement des DEUX fronts** — c'est ce qui empêche d'appeler ça
  une correction d'une ligne ;
- un contrôle qui ne peut pas se faire en local : rejouer le préflight sur la
  prod et y trouver un `204` accepté, puis vérifier que `/health` rend des
  compteurs **non nuls** au bout de quelques minutes de trafic réel.

## Ce qui manque, et qu'il faut nommer

Aucune porte n'aurait attrapé ça, et il ne faut pas prétendre le contraire. Le
défaut ne vit ni dans un fichier ni dans l'autre, il vit dans leur rencontre
**au-dessus du réseau** — un e2e ne le verrait pas non plus, puisqu'il ne
traverse pas de navigateur. Ce qui l'a trouvé est une console ouverte par
hasard, et c'est le vrai enseignement : **une remontée qui échoue en silence
n'a pas de témoin**. Si `/health` avait dit « zéro échantillon depuis N jours »
plutôt que d'afficher zéro comme une valeur, la panne se serait signalée
elle-même.
