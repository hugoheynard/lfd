# Runbook — les gestes, et comment savoir qu'ils ont marché

✅ **Vérifié le 2026-08-13.** Chaque geste est suivi de son **contrôle**. Un
déploiement vert ne prouve rien tout seul — cette page existe pour ça.

## Déployer

Tout part d'un merge dans `main`. Les filtres de chemins choisissent quoi
redéployer.

```bash
git checkout main && git merge --ff-only dev && git push
```

**Contrôle** — pour un backend, lire l'étape « Migrer la base » :

```bash
gh run view <run-id> --log | grep -i "Migrer la base" | grep -iE "Applying|No pending|Datasource"
```

`Applying migration …` ⇒ le schéma a bougé. `No pending migrations` ⇒ rien à
faire, ce qui est normal — **sauf** juste après un changement de base, où ce
message signifie qu'on tape encore sur l'ancienne.

## Après avoir changé une variable GitHub

Rien ne se déclenche : les variables ne sont lues qu'au build.

```bash
gh workflow run deploy_lfd_api.yml --ref main
```

**Contrôle** — pour un front, lire la valeur **dans le bundle servi**, pas dans
la configuration :

```bash
curl -s https://lfc-b2b-admin.pages.dev/ | grep -oE 'main-[A-Z0-9]+\.js' | head -1
```

puis chercher l'URL attendue dans ce fichier. C'est le seul contrôle qui
distingue « déployé » de « configuré ».

## Vérifier que le mur tient

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://lfd-api.lafoliedouce.workers.dev/platform-settings
curl -s -o /dev/null -w "%{http_code}\n" https://lfd-gateway.lafoliedouce.workers.dev/api/lfd/platform-settings
```

Attendu : **404** puis **200**. Un `200` sur la première ligne veut dire que la
porte directe est rouverte.

⚠️ Tant que l'ancien Worker `lfc-b2b-backend` n'est pas supprimé, teste-le AUSSI :
il porte encore les mêmes secrets et la même image, et sa porte directe est
fermée par le même `workers_dev: false` — mais un Worker qu'on croit mort et qui
répond est exactement le genre de chose qu'on ne découvre pas.

⚠️ Laisser **une minute** après un déploiement avant de conclure : la
propagation des routes Cloudflare prend plusieurs dizaines de secondes. Mesurer
trop tôt fait conclure à un échec qui n'existe pas.

## Vérifier le CORS

```bash
curl -s -D- -o /dev/null -X OPTIONS \
  https://lfd-gateway.lafoliedouce.workers.dev/api/lfd/platform-settings \
  -H "Origin: https://lfc-b2b-eu7.pages.dev" \
  -H "Access-Control-Request-Method: GET" | grep -i access-control
```

Et **toujours** avec une origine qui doit être refusée (`https://evil.example`) :
sans ça, on teste une porte ouverte, pas une serrure.

## Vérifier que le throttler limite le bon client

```bash
U=https://lfd-gateway.lafoliedouce.workers.dev/api/lfd/platform-settings
for i in $(seq 1 75); do curl -s -o /dev/null -w "%{http_code}\n" -H "x-lfc-client-ip: 198.51.100.$i" $U; done | sort | uniq -c
```

Attendu : ~60 × `200` puis des `429`. **Zéro 429** signifierait que l'en-tête
forgé recrée un quota à chaque requête — la faille de l'IP cliente rouverte.

## Rouvrir une porte en urgence

Dans `apps/lfc-*/wrangler.jsonc` : `"workers_dev": false` → `true`, commit,
push. C'est un interrupteur de secours, pas un mode de fonctionnement — la
passerelle reste le chemin normal.

## Revenir en arrière

Cloudflare garde les versions. Le plus sûr reste de **redéployer le commit
précédent** : l'image est taguée par SHA, donc reproductible.

```bash
git revert <sha> && git push
```

Pour une **migration de base**, il n'y a pas de retour arrière automatique. Un
déplacement de données se fait en trois déploiements — étendre, basculer,
resserrer — précisément pour que chaque étape soit réversible seule.

## Savoir ce que l'instance en ligne sait faire

Un réglage absent n'est pas une erreur : c'est une **capacité éteinte**, et
l'app le sait. Pour le lui demander :

```bash
curl -s https://<api>/admin/ops/capabilities -H "x-lfc-recompute-token: <jeton>"
```

Elle rend la révision servie et la liste des canaux éteints — la capacité en
mots métier, la variable à poser, ce qui ne marchera pas. Rien de secret n'en
sort : l'inventaire ne manipule que des booléens.

La sonde publique `/health` en porte les **compteurs** (`capabilities.blocking`
/ `.degraded`), sans nommer aucun réglage : dire au monde quelle porte n'est pas
verrouillée est une aide qu'on ne doit qu'à soi-même. Le déploiement s'arrête
sur un canal bloquant (étape « Inventaire des canaux »).

## Si l'API refuse de démarrer : `persistence.migrations_pending`

Symptôme : au démarrage, `La base de données est en retard de N migration(s) : …`
et le processus sort en code 1. Aucune requête n'a été servie.

C'est **voulu**. L'API compare, à l'ouverture de la connexion, les dossiers de
`prisma/migrations` au journal `_prisma_migrations`. Une base en retard ne se
signalait auparavant qu'à l'usage — un 500 `persistence.schema_out_of_sync` sur
la première route touchant une table absente, le reste de l'app paraissant
saine. On servait donc une base à trous sans le savoir.

```bash
pnpm --filter lfd-api exec prisma migrate deploy
```

En déployé, ce message ne devrait jamais apparaître : l'étape « Migrer la base »
précède la mise en ligne de l'image. S'il apparaît, c'est que le déploiement a
sauté cette étape ou visé une autre base — vérifier `DATABASE_LFD_URL` avant
toute chose.

⚠️ Le contrôle ne s'alarme **que de ce qui manque**. Une base plus avancée que
le code démarre sans broncher : c'est l'état normal d'un retour en arrière
applicatif, et refuser de démarrer là interdirait la manœuvre même qui répare
une mise en production ratée.

## Si « Migrer la base du référentiel » échoue

Symptôme : `relation "b2b_channel_binding" already exists`, ou un autre objet
déjà présent.

Cause : la production porte l'objet parce qu'il y a été posé par un `db push`,
sans passer par une migration. `migrate deploy` refuse alors d'avancer — et
c'est ce qu'on veut : il bloque plutôt que de forcer.

Reprise, une migration à la fois :

```bash
pnpm --filter lfd-api exec prisma migrate resolve \
  --applied 20260817083828_canal_b2b_appartenance
```

`resolve --applied` marque la migration comme jouée **sans exécuter son SQL**.
Ne l'utiliser qu'après avoir vérifié que l'objet existe bel et bien et qu'il a
la forme attendue — sinon on inscrit un mensonge dans `_prisma_migrations`, et
la prochaine migration s'appuiera dessus.

## Si une écriture est refusée par « allergène officiel : … »

Symptôme : une écriture sur `pim.allergen_entry` ou `pim.allergen_category`
échoue avec un `SQLSTATE 23001` et l'un de ces deux messages, sans qu'aucun code
TypeScript ne les ait levés :

```
ERROR:  allergène officiel : suppression refusée (SH)
ERROR:  allergène officiel : SH est réglementaire et ne se modifie pas
CONTEXT:  PL/pgSQL function pim.refuse_official_allergen_write() line 12 at RAISE
```

C'est **voulu**. Les 15 catégories et les 30 codes GS1 semés par
`20260902120000_referentiel_allergenes` sont du droit (annexe II du règlement UE
1169/2011), et un trigger `BEFORE UPDATE OR DELETE … WHEN (OLD.official)` les
gèle **en base** : `code`, `key`, `name`, `category_id`, `inco_category`,
`official` et `archived_at`. Ni un `psql` d'astreinte ni une migration future
n'y touchent. Seul `position` reste libre — l'ordre d'affichage n'a pas de
portée réglementaire.

Le geste normal n'est pas de forcer, c'est de **créer une entrée maison**
(`official = false`) : elle se modifie et s'archive librement, et le trigger ne
la voit même pas.

⚠️ **On ne neutralise pas le verrou en passant `official = false`** : cette
colonne est gelée elle aussi, précisément pour fermer cette porte-là. Et
`archived_at` l'est pour la même raison — ici l'archivage EST la suppression
(`CLAUDE.md` §3), donc archiver un allergène réglementaire reviendrait à le
retirer de la saisie par la porte de derrière.

## Corriger une ligne officielle du référentiel d'allergènes

Symptôme : un code, un rattachement ou une mention d'étiquette semés à tort — un
libellé faux sur une étiquette est un défaut de conformité, pas une coquille.

Le geste, **dans UNE migration** — donc dans une transaction, donc tout ou rien :

```sql
DROP TRIGGER allergen_entry_official_lock ON pim.allergen_entry;

UPDATE pim.allergen_entry
   SET name = '{"fr": "…", "en": "…"}'
 WHERE code = 'SH';

CREATE TRIGGER allergen_entry_official_lock
  BEFORE UPDATE OR DELETE ON pim.allergen_entry
  FOR EACH ROW WHEN (OLD.official)
  EXECUTE FUNCTION pim.refuse_official_allergen_write();
```

Le trigger jumeau des catégories s'appelle `allergen_category_official_lock` et
tient à `pim.refuse_official_allergen_category_write()`.

Ce qui se casse si on l'oublie :

- **Corriger à la main en production**, hors migration : la prod et le semis de
  la migration divergent en silence. Toute base neuve — clone de dev, base
  jetable des e2e, reconstruction — reçoit la valeur **fausse**, et le test
  d'intégrité de `test/pim-allergens.e2e-spec.ts` reste vert puisqu'il compare
  la table à la même constante.
- **Recréer le trigger dans une autre migration que celle qui le supprime** :
  entre les deux, la table est sans verrou, et la fenêtre ne se referme que le
  jour où quelqu'un s'en souvient.
- **Supprimer un code plutôt que le corriger** : le `RESTRICT` de
  `ingredient_allergen` refusera si un ingrédient le cite déjà, et une
  déclaration produit qui porte ce code en `Json` n'a, elle, aucune clé
  étrangère pour la protéger — elle deviendra un code inconnu à la projection.

## Retirer le référentiel d'allergènes — l'ordre de démontage

Symptôme : il faut défaire `20260902120000_referentiel_allergenes` (retour
arrière complet, avant que quoi que ce soit d'autre ne s'appuie dessus).

L'ordre n'est pas un goût, c'est la seule séquence que Postgres accepte sans
`CASCADE` :

```sql
DROP TRIGGER allergen_entry_official_lock ON pim.allergen_entry;
DROP TRIGGER allergen_category_official_lock ON pim.allergen_category;

DROP FUNCTION pim.refuse_official_allergen_write();
DROP FUNCTION pim.refuse_official_allergen_category_write();

DROP TABLE pim.ingredient_allergen;
DROP TABLE pim.allergen_entry;
DROP TABLE pim.allergen_category;
```

Puis **retirer les trois modèles de `prisma/schema.prisma`**
(`AllergenCategory`, `AllergenEntry`, `IngredientAllergen`), leurs trois lignes
de `src/platform/database/schema-ops.counter.ts`, et régénérer le client.

Ce que chaque inversion donne, et pourquoi l'erreur envoie chercher ailleurs :

- **Fonction avant trigger** — `cannot drop function
pim.refuse_official_allergen_write() because other objects depend on it`.
  Postgres suggère `CASCADE` ; l'accepter emporte le trigger de l'autre table
  sans le dire.
- **`allergen_category` avant `allergen_entry`** — `constraint
allergen_entry_category_id_fkey … depends on table` : le `RESTRICT` impose de
  descendre des enfants vers les parents.
- **`allergen_entry` avant `ingredient_allergen`** — même refus, par
  `ingredient_allergen_entry_id_fkey`.
- **Modèles laissés dans `schema.prisma`** — le client reste généré contre des
  tables disparues : `prisma.allergenEntry` existe encore côté types et échoue
  au premier appel, en `42P01` (relation inexistante), c'est-à-dire au pire
  moment et loin de la cause.

Note pour ne pas chercher au mauvais endroit : le trigger ne se déclenche ni sur
`DROP TABLE` ni sur `TRUNCATE` — ce sont des triggers de **ligne**. Ce qu'on
libère en supprimant les triggers d'abord, ce sont les **fonctions**, pas les
tables.

## Basculer le back-office vers `lfd-backoffice`

Cloudflare **ne renomme pas** un projet Pages. Le workflow en crée donc un neuf,
et l'ancien continue de servir jusqu'à ce que tu le supprimes — c'est ce qui
rend la bascule sans coupure, à condition de laisser les DEUX origines ouvertes
pendant la traversée.

1. **Auth0**, application « LFC B2B Admin » → **AJOUTER** (sans retirer)
   `https://lfd-backoffice.pages.dev` dans _Allowed Callback URLs_, _Logout
   URLs_ et _Web Origins_. Sans ça, la connexion échoue sur la nouvelle adresse.
2. **Fusionner.** Le front se déploie sur le projet neuf, le backend repart avec
   les deux origines autorisées.
3. 🔴 **LIRE L'URL RÉELLEMENT SERVIE** dans le journal du workflow. Si le nom
   court était pris, Cloudflare a suffixé le sous-domaine **sans rien dire** —
   l'accident `lfc-b2b` → `lfc-b2b-eu7`, qui a laissé la boutique hors CORS
   pendant des jours. Corriger `PROD_FRONT_ORIGINS.b2bAdminFront` si besoin, et
   redéployer le backend.
4. **Vérifier** : se connecter sur la nouvelle adresse, et regarder qu'un appel
   d'API rend bien un `access-control-allow-origin`.
5. **Puis seulement** : passer `LFD_BACKOFFICE_URL` à la nouvelle adresse
   (les liens des e-mails staff), retirer `LEGACY_B2B_ADMIN_FRONT` du CORS,
   retirer l'ancienne URL d'Auth0, supprimer le projet Pages `lfc-b2b-admin`.

⚠️ L'étape 5 est celle qu'on oublie, **parce que tout marche sans elle**. Une
origine laissée en CORS est une origine dont on ne relit plus le contenu
déployé.

## Mettre en service les notifications poussées

Une seule fois, et dans cet ordre.

1. **Générer la paire**, sur ton poste :

   ```bash
   npx web-push generate-vapid-keys
   ```

   Elle identifie ce serveur auprès des services de push. **Garde-la** : la
   régénérer invalide tous les abonnements existants (cf.
   [`secrets-et-variables.md#3-ter`](secrets-et-variables.md)).

2. **Poser les valeurs dans GitHub**, du terminal vers l'interface directement :
   `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` en **Secrets**, `VAPID_SUBJECT` en
   **Variable** si tu veux autre chose que le défaut.

3. **Redéployer le backend.** Un secret posé ne redémarre aucun container : les
   `envVars` ne sont lues qu'au démarrage, et seule une image neuve en déclenche
   un.

4. **Vérifier que la capacité s'est allumée** — elle ne doit plus figurer dans
   l'inventaire :

   ```bash
   curl -s https://<api>/admin/ops/capabilities -H "x-lfc-recompute-token: <jeton>"
   ```

5. **Vérifier depuis un téléphone**, et c'est la seule vraie preuve : ouvrir le
   back-office, l'ajouter à l'écran d'accueil, rouvrir **depuis l'icône**, puis
   Obtenir l'app mobile → Activer les notifications.

### Les trois contextes, et ce que chacun peut

|                               | Notifications | Pourquoi                                            |
| ----------------------------- | ------------- | --------------------------------------------------- |
| Écran d'accueil (iOS/Android) | **oui**       | le seul contexte qu'Apple autorise depuis 16.4      |
| Onglet de navigateur          | Android oui   | iOS refuse hors installation, et **en silence**     |
| Dans la suite (iframe)        | **non**       | un cadre tiers ne peut pas demander la permission   |
| Coque Capacitor (iOS)         | **non**       | sa WebView n'expose pas l'API Push — c'est un recul |

L'écran « Obtenir l'app mobile » dit lequel de ces cas il est en train de vivre,
plutôt que d'offrir un bouton qui échoue. Vérifier après déploiement que le
manifeste sort bien avec un type JSON, sans quoi Chrome refuse l'installation :

```bash
curl -sI https://<admin>/manifest.webmanifest | grep -i content-type
```

⚠️ **Rien de tout cela n'est testable en local.** Web Push exige HTTPS et une
origine réelle, et sur iPhone l'abonnement n'est possible qu'une fois l'app
installée sur l'écran d'accueil — Safari refuse en **silence** avant cela. C'est
le même profil que le webhook Resend : la chaîne ne se vérifie qu'en ligne.

## En dev : un `400` sur un corps pourtant valide

Le symptôme : une requête que le front envoie correctement, refusée en `400`
par un backend qui tourne. Il accuse le front ; le fautif est un **processus qui
sert un contrat périmé**.

**La cause.** Les paquets `@lfd/*` exposent leurs types depuis `src/` et leur
exécutable depuis `dist/` : le compilateur lit la source, Node lit le build.
Deux artefacts qui peuvent diverger — et deux façons de diverger :

1. **Le paquet n'était surveillé par personne.** Les lanceurs énuméraient trois
   paquets à la main (`endpoints`, `contracts`, `storage`) alors que le backend
   en consomme huit. Modifier `pim-contracts` ne reconstruisait donc **rien**,
   indéfiniment. Corrigé : les filtres utilisent le graphe de turbo
   (`--filter=lfd-api...`), qui inclut les dépendances d'une app — et se tient à
   jour tout seul quand on ajoute un paquet.
2. **Le redémarrage tombait trop tôt.** Le programme tsc du backend inclut les
   SOURCES des paquets (vérifiable : `tsc --listFiles | grep packages/`). Une
   modification de paquet faisait donc redémarrer Nest **avant** que le `dist`
   du paquet ne soit reconstruit — puis plus rien ne redémarrait. Corrigé par
   `dev-toolbox/restart-api-on-package-build.mjs`, qui surveille les `dist` et
   touche `apps/lfd-api/src/main.ts` une fois le build posé.

**Si ça se reproduit malgré tout** : redémarrer le backend suffit. Et pour
confirmer que c'est bien ça plutôt qu'un vrai refus de validation, comparer la
date du `dist` du paquet à celle du démarrage du processus.

## Lire les journaux de l'application

Cloudflare **ne remonte pas** la sortie d'un container : l'API `Container`
n'expose que la fin du process, et l'observabilité du Worker ne capte que le
Worker. Le chaînon n'existe pas — ce n'était pas un réglage manqué.

L'application garde donc elle-même ses **300 dernières lignes** d'erreur et
d'alerte, et les rend :

```bash
curl -s "https://<api>/admin/ops/logs?limit=50" -H "x-lfc-recompute-token: <jeton>"
```

Le jeton étant en écriture seule dans GitHub, le chemin normal est le workflow
**`ops_logs`** (Actions → Run workflow), qui imprime un tableau lisible.

⚠️ Tampon **vivant** : borné, perdu au redémarrage, propre à l'instance qui
répond. Il dit ce qui vient de se passer, pas ce qui s'est passé cette nuit —
la conservation durable suppose une table, une rétention et une politique de
données, et reste à faire.

## Enquêter sur qui appelle quoi

La journalisation est **active en permanence** (`"observability": { "enabled":
true }` dans `wrangler.jsonc`). Elle ne l'était pas jusqu'au 2026-08-16, et le
prix s'est payé d'un coup : un `500` sur l'ouverture d'un accès a demandé une
demi-heure d'enquête à travers Cloudflare, Resend et Auth0, alors que la cause
exacte était écrite à chaque tentative dans un journal que rien ne captait. Le
bulletin de démarrage, lui, parlait dans le vide depuis trois jours.

Lire dans Cloudflare → Workers → Observability, ou `wrangler tail`. Le coût est
facturé au volume ; si un jour il pèse, la réponse est
`head_sampling_rate`, **pas** l'extinction : on peut se passer d'un
échantillon, pas de la vue.

## Remettre la production à blanc — délibérément SANS outil

Fait une fois, le **2026-08-16**, pour vider les données de test avant
l'ouverture commerciale. Un script dédié avait été écrit puis **supprimé le jour
même** : une commande qui vide la production en une ligne est un danger
permanent pour un gain d'une fois par an. Son histoire reste dans git
(`prisma/wipe-business-data.ts`, commits du 16/08) si le besoin revient.

Ce qu'il faut savoir si le cas se représente, et qui a coûté du temps :

- **Le transport dépend du schéma de l'URL.** `prisma+postgres://` est une
  passerelle HTTP (Accelerate) ; l'adaptateur `pg` ne sait pas lui parler et
  expire après un long silence. Cf. `PrismaService`, qui arbitre déjà.
- **La console Prisma n'a pas d'éditeur SQL** — `Queries` est du monitoring,
  `Studio` un navigateur ligne à ligne. Passer par `psql` avec la chaîne relue
  dans `Connection strings`.
- **Un `TRUNCATE` en une seule instruction** se moque de l'ordre des clés
  étrangères, à condition que l'ensemble des tables soit complet ; sinon
  Postgres refuse en nommant la manquante — un échec sûr, rien n'est supprimé.
- **Les sauvegardes automatiques** (menu `Backups`) couvrent trois jours sur le
  plan actuel. Restaurer vers une base neuve avant l'opération donne une archive
  figée que la rétention n'effacera pas.
- **Auth0 n'est pas concerné** : les identités survivent à la base, et une
  connexion réussie mène alors à un compte inconnu du backend.

## Savoir où tourne un container

```bash
cd apps/lfd-api
npx wrangler containers list        # id de l'application
npx wrangler containers instances <id>   # emplacement RÉEL (ex. lhr20)
npx wrangler containers info <id>        # relit les `constraints` côté serveur
```

La latence seule ne prouve rien : c'est `instances` qui donne l'emplacement.

## Symptômes fréquents

| Ce qu'on voit                                                    | Cause probable                                        |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| `500 Container suddenly disconnected` juste après un déploiement | démarrage à froid — réessayer                         |
| `502 upstream injoignable` par la passerelle                     | idem, ou binding absent                               |
| `503 backend non relié`                                          | service binding non déclaré — erreur de configuration |
| CI rouge sur MinIO / Docker Hub                                  | aléa externe — relancer                               |
| Déploiement vert, panne à la 1ʳᵉ requête                         | connexion Prisma paresseuse : le boot ne teste rien   |
| Front qui appelle une vieille URL                                | variable changée sans redéploiement                   |
