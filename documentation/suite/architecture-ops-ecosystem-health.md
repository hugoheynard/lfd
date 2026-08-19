# Suite LFC — OPS « Ecosystem Health » (design, doc-first)

Ce document fixe la **cible** d'une app **OPS** de la suite : une vue **santé de
l'écosystème** — un schéma vivant où l'on voit d'un coup d'œil les **APIs
externes** (Shopify…), les **workers d'intégration** (sync PIM…) et les
**services domaine** (STOCK…), chacun avec son **état courant** et ses
dépendances. On écrit le design et le **contrat** d'abord ; l'app vient quand la
flotte le justifie (§9). Revue adversariale en fin de doc (§10).

Complément de [`architecture-suite-gateway-scaling.md`](architecture-suite-gateway-scaling.md)
(comment tout parle) : ici, **comment on sait que tout va bien**.

---

## 1. Le besoin

La suite passe de « une app » à « une flotte » : PIM + son worker de sync
Shopify, backend B2B, bientôt **STOCK** (réassort), demain d'autres canaux. Trois
questions n'ont aujourd'hui **aucune réponse centralisée** :

- Est-ce que le worker de sync Shopify **tourne** ? Sa file est-elle **en
  retard** ? Combien d'erreurs sur la dernière heure ?
- **Shopify** est-il **joignable / dégradé** en ce moment (et donc « ce n'est pas
  nous ») ?
- Quand une chose casse, **quelle dépendance** est la cause (un nœud rouge en
  explique un autre) ?

Chaque app répond aujourd'hui **pour elle-même**, en silo. La cible : **une vue
écosystème**, où la santé est une **propriété observable de la topologie**, pas
une inspection manuelle app par app.

---

## 2. Périmètre — l'invariant qui structure tout

Deux états à **ne jamais mélanger** :

|                       | Qui **possède** la vérité | Exemples                                                                                   | OPS en fait quoi             |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------- |
| **État DOMAINE**      | **chaque app**            | binding produit synchronisé, dernier hash poussé, stock d'une réf                          | **rien** — il n'y touche pas |
| **État OPÉRATIONNEL** | **OPS (observe)**         | worker up/down, profondeur de file, taux d'erreur, dernier heartbeat, joignabilité Shopify | **agrège & affiche**         |

**Conséquence directe** (et la réponse à « le PIM devient lecteur ») : le PIM
**publie** des signaux opérationnels et **lit** la santé agrégée pour afficher un
bandeau « worker Shopify dégradé ». Il **ne** devient **pas** lecteur de son
propre état domaine — ses `ShopifyProductBinding` restent sa vérité, dans son
Postgres. OPS **observe**, il ne **possède** pas le métier.

### Ce que OPS ne fera **jamais** (frontière)

- **Pas** une source de vérité métier ni un store de données domaine (pas de
  binding, pas de stock, pas de commande dedans).
- **Pas** un orchestrateur : il **n'agit pas** (pas de « relancer le worker »
  depuis OPS en v1 — lecture seule ; les actions viendront, murées, plus tard).
- **Pas** un APM/traces complet (pas de spans par requête) : c'est une **carte de
  santé**, pas Datadog. Métriques agrégées, pas la télémétrie fine.
- **Pas** un point de défaillance de la flotte : si OPS tombe, **les workers
  continuent** (§10). OPS n'est jamais dans le chemin critique.

---

## 3. La cible — la carte de l'écosystème

Chaque **nœud** porte un `kind` (api externe / worker / service / datastore) et
un `status` (`up` / `degraded` / `down` / `unknown`). Les **arêtes** = « dépend
de ». Un nœud rouge en amont **explique** un nœud dégradé en aval.

```mermaid
flowchart LR
  subgraph ext["APIs externes (sondées)"]
    SHOP[["Shopify Admin API"]]:::up
    AUTH[["Auth0"]]:::up
  end
  subgraph workers["Workers d'intégration (heartbeat)"]
    SYNC["PIM · sync Shopify"]:::degraded
    RESTOCK["STOCK · réassort"]:::up
  end
  subgraph services["Services domaine (heartbeat)"]
    PIM["PIM backend"]:::up
    B2B["B2B backend"]:::up
    STOCK["STOCK agrégateur"]:::up
  end
  subgraph data["Datastores (sondés)"]
    PGP[("PIM Postgres")]:::up
    PGB[("B2B Postgres")]:::up
  end

  SHOP --> SYNC --> PIM --> PGP
  STOCK --> RESTOCK --> SHOP
  AUTH -.-> PIM
  AUTH -.-> B2B
  B2B --> PGB
  STOCK --> PGP

  classDef up fill:#1b5e20,color:#fff,stroke:#2e7d32;
  classDef degraded fill:#a06a00,color:#fff,stroke:#c68a00;
  classDef down fill:#7f1d1d,color:#fff,stroke:#b91c1c;
```

Lecture : ci-dessus, `sync Shopify` est **dégradé** ; son amont `Shopify Admin
API` est **up** → donc la cause est **chez nous** (file en retard, erreurs), pas
chez Shopify. C'est **ça**, la valeur : la **causalité** en un coup d'œil.

---

## 4. Le modèle d'état — **push** pour ce qu'on possède, **probe** pour l'externe

Décision (§ choix produit) : **push-first**. Chaque worker/service **pousse** son
heartbeat ; les dépendances **externes** (Shopify, Auth0) ne peuvent pas pousser
→ OPS les **sonde**. Deux mécanismes, un seul modèle de nœud.

```mermaid
flowchart TB
  subgraph owned["Ce qu'on possède"]
    W1["Worker sync"] -- "heartbeat + events\n(toutes les Ns + à chaque job)" --> ING
    W2["STOCK worker"] -- heartbeat --> ING
  end
  subgraph probes["Ce qu'on ne possède pas"]
    PRB["OPS prober (cron)"] -- "ping léger\n(shop{name} / status page)" --> SHOP[["Shopify"]]
    PRB -- "/.well-known / JWKS" --> AUTH[["Auth0"]]
    PRB -- "SELECT 1" --> PG[("Postgres")]
  end
  ING["OPS backend (NestJS)\ningest heartbeat/probe"] --> LIVE["état LIVE\n(mémoire + Redis pub/sub)"]
  PRB --> LIVE
  ING --> PG2[("Postgres / Prisma\nhistorique = taux d'erreur, timelines")]
  LIVE -- "SSE / WebSocket" --> APP["App OPS (Angular + fold)\nschéma live"]
  LIVE -- "santé (slice)" --> PIMUI["PIM · bandeau 'sync dégradé'"]
```

- **Push (workers, services)** : un heartbeat périodique (**même à vide** — voir
  §10, « silence ≠ mort ») + des **events** de cycle de vie (`job.started` /
  `job.ok` / `job.failed`, `deploy`). Portés par le **contrat** (§5).
- **Probe (Shopify, Auth0, Postgres)** : un **cron OPS** émet, pour chaque
  dépendance externe, un enregistrement **de la même forme** qu'un heartbeat — un
  ping bon marché (`query { shop { name } }` pour Shopify, lecture JWKS pour
  Auth0, `SELECT 1` pour un datastore). L'externe devient un **nœud comme un
  autre**, juste alimenté « du dehors ». **C'est ce qui met la santé Shopify sur
  la carte.**

### Où vit l'état (dans la **suite**, pas en bespoke Cloudflare)

L'app OPS suit **le stack de la suite** : **backend NestJS + front Angular +
fold**, comme le PIM et le B2B. Donc pas de Durable Object / D1 : l'état vit dans
le backend Nest, avec les mêmes primitives que les autres backends.

| Besoin                                                  | Support (Nest)                                                                                               | Pourquoi                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **État LIVE** par nœud + fan-out temps réel             | **mémoire du process** + **Redis pub/sub** (l'infra Redis existe déjà : BullMQ, adaptateur socket multi-pod) | cohérent, multi-pod, WebSocket/SSE vers l'UI sans polling |
| **Historique** (taux d'erreur 1h, timelines, incidents) | **Postgres via Prisma**                                                                                      | fenêtres glissantes, mêmes outils que le reste            |
| **Ingest** (heartbeats + probes)                        | **contrôleur NestJS** (`/ops/ingest`) muré staff                                                             | une app suite normale, pas un edge worker                 |

> Les **briques surveillées**, elles, peuvent être n'importe quoi (Cloudflare
> Worker de sync, service Nest, cron Cloud Run) : elles **poussent** vers l'ingest
> OPS via HTTP. OPS n'impose pas leur runtime, seulement le **contrat** (§5).

---

## 5. Le contrat — `@lfd/ops-contract`

Même patron que [[project_lfd_pim_contracts]] : un package **type-only + shapes**,
consommé par tout worker et par OPS. **C'est le livrable pas cher à fort levier**
(§9) : on le câble dans chaque worker à sa naissance, l'app OPS devient un simple
lecteur plus tard.

```ts
// Formes (esquisse — le doc, pas le code)
type NodeKind = "external-api" | "worker" | "service" | "datastore";
type HealthStatus = "up" | "degraded" | "down" | "unknown";

interface Heartbeat {
  node: string; // id stable du nœud (ex. 'pim.sync-shopify')
  at: string; // ISO
  status: HealthStatus; // ce que le nœud dit de lui-même
  detail?: string;
  metrics?: {
    queueDepth?: number;
    inFlight?: number;
    lastJobAt?: string;
    errorRate1m?: number; // 0..1
  };
}

interface LifecycleEvent {
  node: string;
  at: string;
  kind: "job.started" | "job.ok" | "job.failed" | "deploy" | "config.changed";
  ref?: string; // id de job / sha de déploiement
  message?: string;
}

// Ce que OPS REND (agrégé) — jamais poussé tel quel :
interface NodeHealth {
  node: string;
  kind: NodeKind;
  status: HealthStatus; // dérivé (voir staleness §10)
  since: string; // depuis quand ce status
  lastHeartbeatAt: string | null;
  dependsOn: readonly string[];
  metrics?: Heartbeat["metrics"];
  lastError?: { at: string; message: string };
}
```

Côté émetteur, un **mini-client** (le seul « code » réutilisable) :

```ts
const ops = createOpsReporter({ node: "pim.sync-shopify", sink });
await ops.heartbeat("up", { queueDepth: 12 }); // périodique, même à vide
await ops.event("job.failed", { ref: jobId, message });
```

`sink` = un simple **`fetch` HTTP** vers l'ingest OPS NestJS (`/ops/ingest`),
authentifié par un token de service. La brique émettrice n'a besoin que de
**l'URL + le contrat** — quel que soit son runtime (Cloudflare Worker, service
Nest, cron). Batch/retry best-effort : un heartbeat perdu n'est pas critique
(le suivant corrige ; l'absence prolongée devient `unknown`, §8/§10).

### Topologie = **manifeste déclaré**, pas deviné

Les nœuds et arêtes vivent dans un **manifeste** (comme le registre d'apps de la
suite existe déjà) : `{ node, kind, dependsOn, probe? }`. Déclaré, versionné,
revu. On **ne devine pas** la topologie du trafic (bruit, faux liens). La 3ᵉ
occurrence d'un besoin de découverte auto déclenchera la discussion, pas avant.

---

## 6. Le rôle de « lecteur » — appliqué

- **App OPS** : lit l'état **live** (WebSocket/SSE depuis le backend Nest), rend le
  schéma + overlay santé + drill-down (metrics, derniers events, dernière erreur).
- **PIM (et autres apps)** : lisent un **slice** santé (`NodeHealth` de leurs
  propres nœuds) pour un **bandeau** (« sync Shopify dégradé — file en retard »).
  Le PIM **n'apprend pas** de OPS l'état de ses bindings : il apprend l'état de
  son **worker**. Domaine vs opérationnel (§2), toujours.

---

## 7. L'app OPS dans la suite

**Stack = celui de la suite**, aligné sur PIM/B2B : **backend NestJS**, **front
Angular**, **fold-ng** pour le chrome. Aucune techno bespoke — OPS est une app
suite comme les autres.

- **Tuile staff** sous `lfc-suite-shell` (comme le B2B admin), **audience staff
  uniquement** (§10 sécurité).
- **Backend NestJS** = ingest (heartbeats + probes) + prober cron + état live
  (mémoire + Redis) + historique (Prisma/Postgres) + flux live (SSE/WS). Ne
  détient **que** de l'état opérationnel **re-dérivable** (§2).
- **Front Angular + fold** = le **schéma live de toutes les briques** (lib de
  graphe / rendu type mermaid) + overlay santé (badges fold up/degraded/down) +
  cartes de nœud (drill-down : métriques, derniers events, dernière erreur) +
  timeline d'incidents. `signal`/`toSignal` sur le flux live, conventions front
  identiques aux autres apps.

---

## 8. Contrat de santé — dérivation du `status`

Le `status` **rendu** d'un nœud n'est pas juste « ce qu'il a dit » :

1. **`down`** : le nœud a rapporté `down`/`degraded`, **ou** un probe échoue.
2. **`unknown` (périmé)** : `now - lastHeartbeatAt > TTL` → on **ne sait pas**
   (le nœud n'a pas parlé). **Distinct de `down`** — voir §10.
3. **`degraded`** : `errorRate1m` au-dessus d'un seuil, ou file au-dessus d'un
   seuil, ou une **dépendance** `down` (propagation amont → aval).
4. **`up`** : heartbeat récent + métriques sous seuils.

Seuils dans le **manifeste** par nœud (un worker de réassort tolère une file plus
grande qu'un worker de sync interactif).

---

## 9. Plan de câblage progressif (le **pas cher d'abord**)

On ne bâtit pas l'app OPS tant que la flotte est jeune. On **investit dans la
couture stable** maintenant :

| Étape | Quoi                                                                          | Quand                                    |
| ----- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| **0** | **Ce doc** + `@lfd/ops-contract` (shapes + `createOpsReporter`)               | **maintenant**                           |
| **1** | 1ᵉʳ émetteur : le **worker de sync Shopify du PIM** pousse heartbeat + events | quand le worker existe                   |
| **2** | **Prober Shopify** (+ Auth0, Postgres) → nœuds externes sur la carte          | avec l'étape 1                           |
| **3** | Backend OPS Nest : ingest + état live (Redis) + historique (Prisma)           | idem                                     |
| **4** | **App OPS** (schéma live)                                                     | quand **≥3 nœuds vivants** valent la vue |
| **5** | Bandeaux « lecteur » dans le PIM (slice santé)                                | après l'app                              |
| **6** | Actions murées (relancer/mettre en pause)                                     | **différé**, hors v1                     |

Règle « généraliser sur le 2ᵉ usage réel » : le **contrat** est écrit une fois et
sert le 1ᵉʳ worker ; l'**app** attend d'avoir de quoi la remplir.

---

## 10. Revue adversariale — ce qui casse

- **Silence ≠ mort.** Un worker qui n'émet plus est peut-être **mort**, ou juste
  **oisif** (aucun job). Sans plancher, on afficherait « down » à tort à chaque
  nuit calme. **Mitigation** : heartbeat **périodique même à vide** ; l'absence
  au-delà du TTL est `unknown` (« on ne sait pas »), **pas** `down`. Un vrai
  `down` est **rapporté** ou **sondé**, jamais **déduit du silence**.
- **Qui surveille OPS ?** OPS tombé = on est **aveugle** (pas en panne, aveugle).
  **Mitigation** : OPS **hors chemin critique** (les workers tournent sans lui) ;
  un **uptime externe** (ping tiers) sur OPS lui-même ; l'état live persiste dans
  **Redis**, donc un backend OPS redémarré le **retrouve** — c'est un **lecteur**
  re-démarrable, pas le détenteur unique.
- **Faux positif Shopify.** Un probe qui tape une route lente ≠ Shopify en panne.
  **Mitigation** : ping **léger et stable** (`shop { name }`), seuils + **N échecs
  consécutifs** avant `down`, et croiser avec la **status page** Shopify si
  besoin. Ne jamais crier au loup sur un timeout isolé.
- **Coût / cardinalité.** Un heartbeat par worker toutes les N secondes × écriture
  Postgres = ça chiffre. **Mitigation** : le live va dans **Redis** (pas
  d'écriture disque par battement) ; Postgres ne reçoit que les **events** et des
  **agrégats** (fenêtres), pas chaque heartbeat.
- **Sécurité.** OPS expose la **topologie interne** + des messages d'erreur →
  **staff only** (audience Auth0 staff, comme le B2B admin), jamais exposé
  client. Les messages d'erreur techniques ne fuient pas de secret (déjà la règle
  du `AppErrorFilter`).
- **Contrat qui ment.** Un worker peut rapporter `up` en étant cassé (bug dans son
  propre heartbeat). **Mitigation** : croiser **auto-déclaré** (heartbeat) et
  **observé du dehors** (probe / taux d'erreur mesuré côté ingest) — deux angles,
  comme la vérification adversariale ; un `up` déclaré + un `errorRate1m` élevé
  mesuré = **degraded**, la mesure gagne.

---

## 11. Décisions ouvertes (à trancher avant l'étape 3)

> **Mise à jour 2026-08-19.** Trois points sont tranchés plus bas : la troisième
> source d'observation (§12, la passerelle via Analytics Engine), ce que
> « plafond machine » veut dire et pourquoi le coût en sort (§13), et l'hébergement
> du backend OPS dans `lfd-api` avant la mise en service (§14). Les jalons sont au §15.

1. **État live multi-pod** : mémoire process + **Redis pub/sub** (l'infra existe)
   suffit-elle, ou faut-il un « board » persistant Redis (hash par nœud) pour
   qu'un pod qui redémarre retrouve l'état sans attendre le prochain heartbeat ?
   Défaut proposé : **Redis hash `ops:node:<id>` + pub/sub** pour le fan-out.
2. **Fenêtre d'historique** en Postgres : 24 h ? 7 j ? (coût vs utilité des
   timelines). Purge par cron.
3. **Rendu du schéma** : mermaid généré côté front (simple, statique-ish) vs lib
   de graphe interactive (zoom, drag) — trancher au moment de l'app (étape 4).
4. **La caisse / le POS** est-il un nœud OPS un jour (santé de l'encaissement) ou
   hors périmètre ? (à cadrer quand la caisse entre dans la suite.)

```

```

---

## 12. La passerelle devient un observateur (Workers Analytics Engine)

Décidé le 2026-08-19. Le design d'origine connaissait deux sources : le **push**
(heartbeat, ce qu'un nœud dit de lui-même) et le **probe** (ce qu'on constate du
dehors sur ce qu'on ne possède pas). Il en manquait une troisième, et c'est la
plus fiable pour nos propres briques : **ce que la passerelle voit passer**.

Elle est le seul chemin (§ `ops/securite-frontiere-de-confiance.md`) : rien
n'atteint un backend sans traverser `lfc-suite-gateway`. Elle sait donc, sans
rien demander à personne, combien de requêtes sont parties vers chaque backend,
combien sont revenues en erreur, et en combien de temps.

### Ce que ça répare dans le modèle

L'invariant « **silence ≠ mort** » (§10) protège d'un faux positif la nuit, au
prix d'un trou : un backend réellement mort reste `unknown` indéfiniment. La
passerelle lève l'ambiguïté, et c'est une **preuve**, pas une déduction :

| Trafic vu par la passerelle | Heartbeat | Verdict    |
| --------------------------- | --------- | ---------- |
| aucun                       | muet      | `idle`     |
| présent, réponses normales  | muet      | `degraded` |
| présent, **5xx / 502**      | muet      | **`down`** |

Un 502 rendu par la passerelle a un sens particulier : il signifie « upstream
injoignable » — c'est **elle** qui l'a fabriqué, pas le backend. C'est le signal
le plus propre qu'un container ne répond plus.

### Pourquoi Analytics Engine et pas un compteur

Un compteur (Durable Object, KV) impose de décider **à l'écriture** ce qu'on
saura lire : une granularité, une fenêtre, des dimensions. On se trompe toujours,
et on ne peut pas revenir en arrière sur le passé.

Analytics Engine écrit des **points**, et l'agrégation se fait **à la lecture**,
en SQL. L'écriture ne bloque pas la requête (`writeDataPoint` est synchrone et
non-bloquant côté Worker), le coût est celui de l'échantillonnage, et une
question qu'on n'avait pas prévue reste posable sur les données déjà écrites.

C'est exactement le compromis que le design demande : **métriques agrégées, pas
de télémétrie fine** — la finesse existe à l'écriture, mais personne ne lit
jamais une requête individuelle.

### Le point de donnée

Un par requête traversée, dimensions choisies pour ce qu'on veut **grouper**, pas
pour ce qu'on aimerait fouiller :

- `indexes` : le nœud cible (`b2b`, `pim`) — c'est la clé d'échantillonnage,
  donc la dimension qu'on ne veut jamais perdre.
- `blobs` : classe de statut (`2xx`/`4xx`/`5xx`/`502-gateway`), préfixe de route.
- `doubles` : durée en ms, et `1` (le compteur).

**Jamais d'identifiant client, jamais d'IP, jamais de chemin complet.** La
passerelle est le seul endroit qui voit l'IP réelle ; ce n'est pas une raison
pour l'écrire quelque part. Un préfixe de route suffit à savoir _quoi_ est
lent — savoir _qui_ n'est pas la question d'une carte de santé.

### Le rate-limit enfin visible

`ops/README.md` établit que **le seul rate-limit qui fonctionne est le throttler
NestJS** — celui de l'edge Cloudflare est inerte, et il n'y a ni zone ni WAF.
Cette défense mord aujourd'hui **sans que personne ne le sache**. Les `429`
comptés par la passerelle la rendent observable : c'est le premier vrai bénéfice
de sécurité de tout ce chantier.

---

## 13. Le « plafond machine » — dire ce que ça veut dire avant de l'animer

L'app doit colorer les liens selon qu'on approche du plafond. Encore faut-il que
le plafond existe.

**Ce n'est pas un débit.** Les containers Cloudflare ne facturent ni ne limitent
à la requête : ils facturent le **temps d'instance allumée** (vCPU·s, GiB·s), et
`lfd-api` tourne en `max_instances: 1`, `instance_type: "basic"` (¼ vCPU, 1 Gio).
Dix requêtes par heure ou dix mille : **le coût est le même**. Un « prix par
requête » serait un nombre précis et faux.

Le vrai plafond est la **saturation d'une instance unique** : la concurrence en
vol face à ce qu'un ¼ de vCPU peut absorber. Il se lit sur trois signes, dont
aucun n'est suffisant seul :

1. **La latence qui décroche** — p95 mesuré par la passerelle. Le premier signe,
   toujours ; une file d'attente se voit avant de déborder.
2. **La concurrence en vol** — rapportée par le nœud lui-même (`inFlight` du
   heartbeat, déjà au contrat) et corroborée par la passerelle.
3. **Les rejets** — 429 du throttler, 502 quand l'instance ne répond plus.

D'où la règle de rendu : **la couleur d'un lien vient d'un rapport
d'occupation, pas d'un compteur de hits.** Un trait qui rougit parce que le
trafic monte alors que tout va bien serait pire qu'inutile — il apprendrait à
ignorer la couleur.

Et on garde la discipline adversariale du §10 : `inFlight` est **auto-déclaré**,
la latence est **observée**. Si les deux divergent, la mesure gagne.

> **Le coût, lui, n'est pas dans cette carte.** « Ça va mal » et « ça coûte
> cher » se regardent à des moments différents et se trompent différemment. Une
> surface FinOps séparée, alimentée par l'API de facturation Cloudflare et les
> factures tierces (Postgres, Resend, Auth0), et annoncée comme une **estimation**.
> Hors périmètre v1.

---

## 14. Où vit le backend OPS — dans `lfd-api`, en pré-release

Décidé le 2026-08-19, et **assumé comme provisoire**.

Le design plaçait OPS comme une app de la suite. Avant la mise en service, on
l'héberge dans `lfd-api` — pour une raison qui vaut plus que la commodité :
**l'annuaire staff et son mur y sont déjà**. `staff_users`, les rôles, les
dérogations, `StaffAccessResolver` et son cache : OPS a besoin d'exactement ça,
et le recréer ailleurs signifierait deux vérités sur qui est staff.

### Ce que ça impose au découpage

`src/ops/` devient un **cinquième bloc**, à inscrire dans `BLOCK_OF` du gate
`lint:context-boundaries` — qui échoue sur un dossier inconnu, exprès. Sa ligne
dans la matrice est la plus stricte possible :

```
ops → platform          (rien d'autre)
personne → ops
```

OPS **observe**, il ne possède aucun métier : il n'a donc rien à lire chez
`b2b`, `pim` ou `staff`. Le mur staff lui arrive comme aux autres, par le port
`StaffAccessResolver` déclaré dans `platform` et lié dans `appBootstrap`.
Une ressource `ops` s'ajoute à l'enum `StaffResource` (Prisma + contrats +
migration), exactement comme `catalog` en B2d.

### Le prix, et la sortie

Deux choses à ne pas perdre de vue :

- **OPS ne doit jamais être dans le chemin critique** (§10). Hébergé dans le
  même processus, la tentation d'un appel synchrone existe : aucune lecture OPS
  ne doit se trouver sur le trajet d'une requête métier.
- **La sortie est un déménagement de bloc**, c'est-à-dire l'opération qu'on sait
  déjà faire : B2c a déplacé le référentiel entier. Un bloc qui ne lit que
  `platform` et que personne n'importe est précisément celui qui part le plus
  facilement.

---

## 15. Les jalons

| Jalon     | Quoi                                                                                                                              | Dépend de |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **J1** ✅ | Dataset Analytics Engine + `writeDataPoint` dans la passerelle (hors du chemin de réponse), sous tests — **fait le 2026-08-19**   | —         |
| **J2** ✅ | Contrat : `TrafficWindow` dans `@lfd/ops-contract` (requêtes, erreurs serveur, 429, 502 passerelle, p95) — **fait le 2026-08-19** | J1        |
| **J3**    | Bloc `src/ops/` dans `lfd-api` : entrée `BLOCK_OF`, ressource staff `ops` + migration, lecteur SQL d'AE, endpoint                 | J2        |
| **J4**    | Manifeste de topologie déclaré (nœuds + arêtes) et dérivation du `status` (§8 + table du §12)                                     | J3        |
| **J5**    | Écran : schéma live, liens animés par **occupation** (§13), staff-only                                                            | J4        |
| **J6**    | Heartbeat des backends (`inFlight`, `errorRate1m`) pour croiser l'auto-déclaré et l'observé                                       | J3, en // |

### Lire la fenêtre — deux pièges d'Analytics Engine

Le contrat les rend explicites parce qu'ils ne se voient pas :

- **`requests` se lit `SUM(_sample_interval)`, pas `COUNT(*)`.** Analytics
  Engine échantillonne quand le volume monte et porte le poids de chaque point
  dans cette colonne. Un `COUNT(*)` rendrait le nombre de points **conservés** :
  un chiffre juste, réponse à une autre question.
- **`p95Ms` se pondère du même poids.** Une latence calculée sur un échantillon
  non pondéré ment dès le premier délestage — et ment vers le bas, donc rassure
  à tort.

Et une décision de fond : **les `429` ne sont pas des erreurs.** Le throttler qui
refuse est le système qui fonctionne. Les compter dans le taux ferait rougir la
carte au moment précis où elle devrait rassurer — et pousserait un jour quelqu'un
à relâcher la seule défense qui marche pour « faire repasser le tableau au vert ».

### Vérifier le J1 sans déployer

En local il n'y a ni dataset ni API SQL. Le binding `TRAFFIC` est donc absent, et
la passerelle **journalise** le point au lieu de l'écrire — construit par la même
fonction pure, donc au format exact de ce qui partira en production :

```bash
pnpm suite:dev:gateway
```

Puis, en naviguant dans la suite, le terminal de la passerelle donne une ligne
par requête traversée :

```
ops b2b 2xx admin/orders upstream 12ms
ops b2b 429 orders upstream 3ms
ops pim 5xx catalogue gateway 5000ms
```

La dernière est celle qui compte : `gateway` en origine signifie que le
back-end **n'a pas répondu** — c'est le seul cas qui autorisera `down`.

Un binding absent en **production** produirait les mêmes lignes, et c'est
voulu : une erreur de configuration muette se traduirait par une carte de santé
vide qu'on croirait calme.

Le J1 est autonome et sans risque : la passerelle écrit, personne ne lit encore.
Rien n'est visible avant J5, et c'est voulu — on accumule d'abord de quoi
remplir l'écran, sinon il naîtrait vide et mentirait.
