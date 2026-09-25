# Runbook — les gestes, et comment savoir qu'ils ont marché

✅ **Vérifié le 2026-08-13.** Chaque geste est suivi de son **contrôle**. Un
déploiement vert ne prouve rien tout seul — cette page existe pour ça.

⚠️ **Deux gestes de la section « Déployer » étaient faux, et l'ont été pendant
deux déploiements** : la commande de fusion et l'adresse du back-office. Tous
deux corrigés et **rejoués** le 2026-09-13, à l'occasion de la promotion
`544c54e6`. Le reste de la page n'a pas été revérifié à cette date — une page
qu'on lit sous pression mérite qu'on sache jusqu'où elle a été éprouvée.

## Déployer

Tout part d'une **avance rapide** de `main` sur `dev`. Les filtres de chemins
choisissent quoi redéployer.

```bash
git push origin dev                # la CI tourne sur dev, et seulement là
# … attendre qu'elle soit verte …
git push origin dev:main           # avance rapide : main reçoit CE commit-là
```

🔴 **Depuis le 2026-09-25, plus de commit de fusion, et plus de CI sur
`main`.** Les promotions se faisaient par `git merge --no-ff dev` : le commit de
fusion avait un SHA qu'aucune CI n'avait vu, et la CI se rejouait donc sur
`main`, sur un arbre identique à `dev` déjà vert. Mesuré le 2026-09-24 : 14
minutes d'attente sur 21 avant le premier déploiement. Désormais `main` reçoit
le SHA de `dev`, et les déploiements retrouvent son run de CI par ce SHA
(`.github/actions/attendre-un-run`).

**Ce qui empêche de revenir en arrière** :

- le hook `.githooks/pre-push` refuse une promotion qui ne pousse pas
  exactement `origin/dev`, ou dont la CI est rouge ;
- côté serveur, un commit qui atteindrait `main` sans être passé par `dev` n'a
  aucun run de CI : l'attente des déploiements échoue, et rien ne part.

Si `main` porte un jour un commit que `dev` n'a pas (un correctif posé en
urgence), l'avance rapide devient impossible : **réaligner `dev` d'abord**, par
`git merge --ff-only origin/main` sur `dev`, puis `git push origin dev`. C'est ce
qui a été fait une fois le 2026-09-25, après la dernière promotion par fusion
(`5b4193b52`).

⚠️ La CI de `dev` annule un run en cours quand un nouveau commit arrive
(`cancel-in-progress`). On promeut donc le dernier `dev` publié, celui dont la
CI a fini — le hook y veille.

**Contrôle** — pour un backend, lire l'étape « Migrer la base » :

```bash
gh run view <run-id> --log | grep -i "Migrer la base" | grep -iE "Applying|No pending|Datasource"
```

`Applying migration …` ⇒ le schéma a bougé. `No pending migrations` ⇒ rien à
faire, ce qui est normal — **sauf** juste après un changement de base, où ce
message signifie qu'on tape encore sur l'ancienne.

Depuis la sortie d'Accelerate (code du 2026-09-19), la migration passe par le
secret **`DATABASE_LFD_PROD_DIRECT_URL`**, pas par celui du container ; absent, elle
échoue en le nommant. Et l'étape « Attendre que l'image neuve serve » échoue si
`/health` ne publie pas, dans `database`, le transport écrit en tête du workflow
(`EXPECTED_DATABASE_TRANSPORT`) — cf. « Sortir d'Accelerate » plus bas.

## Après avoir changé une variable GitHub

Rien ne se déclenche : les variables ne sont lues qu'au build.

```bash
gh workflow run deploy_lfd_api.yml --ref main
```

**Contrôle** — pour un front, lire la valeur **dans le bundle servi**, pas dans
la configuration :

```bash
curl -s https://lfd-backoffice.pages.dev/ | grep -oE 'main-[A-Z0-9]+\.js' | head -1
curl -s https://lfc-b2b-eu7.pages.dev/    | grep -oE 'main-[A-Z0-9]+\.js' | head -1
```

puis chercher l'URL attendue dans ce fichier. C'est le seul contrôle qui
distingue « déployé » de « configuré ».

🔴 **L'adresse du back-office était FAUSSE ici jusqu'au 2026-09-13** :
`lfc-b2b-admin.pages.dev`, qui ne résout plus. `curl` rend alors `000` et une
sortie vide — c'est-à-dire exactement ce que rendrait un front mort. Un contrôle
qui échoue comme la panne qu'il cherche est pire que pas de contrôle. Le projet
Pages s'appelle **`lfd-backoffice`** — la section sur les URL de rappel Auth0,
plus bas dans cette page, le disait déjà : le document se contredisait avec
lui-même. La boutique, elle, est bien `lfc-b2b-eu7`.

⚠️ L'ancienne origine reste **autorisée au CORS** (vérifié le 2026-09-13 :
la passerelle renvoie son `access-control-allow-origin` pour les deux). Une
adresse morte qu'on laisse dans une liste blanche ne gêne personne aujourd'hui
et ne s'explique plus dans six mois.

⚠️ **Chercher la chaîne attendue dans le BON fichier.** Les deux fronts
découpent en chunks paresseux : `main-*.js` ne porte que ce qui est chargé au
démarrage — les routes, et rien des écrans. Un libellé d'écran (« Passer une
commande ») est absent de `main` **même dans un build correct**. Pour prouver
qu'une version est servie, viser ce qui vit dans `main` — un chemin de route,
une URL d'API — ou télécharger le chunk concerné. Le 2026-09-13, le contrôle
fait sur `main` a conclu à tort que le déploiement n'était pas passé.

## Vérifier que le mur tient

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://lfd-api.lafoliedouce.workers.dev/health
curl -s -o /dev/null -w "%{http_code}\n" https://lfd-gateway.lafoliedouce.workers.dev/api/lfd/health
curl -s -o /dev/null -w "%{http_code}\n" https://lfd-gateway.lafoliedouce.workers.dev/api/lfd/admin/pricing
```

Attendu : **404**, **200**, **401**. Un `200` sur la première ligne veut dire que
la porte directe est rouverte.

⚠️ Ce contrôle visait `/platform-settings` jusqu'au 2026-09-03. **Cette route
n'existe plus**, et un 404 des DEUX côtés ressemblait à un mur qui tient alors
qu'il ne mesurait qu'une adresse morte. D'où les trois lignes : `/health` est
publique et prouve que la gateway sert ; une route `admin` doit rendre **401**
sans jeton, ce qui prouve en plus que l'application est bien derrière — un mur
qu'on ne teste que sur du 404 ne distingue pas « fermé » de « rien ».

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

## Fermer ou ouvrir la boutique en ligne

Un réglage, pas un déploiement : **`/admin/feature-access`**, carte
« Boutique », réservé à l'écriture `b2b_feature_access` (administrateurs).
Trois niveaux : **Fermée** (rien, vitrine publique comprise), **Voir** (le
catalogue et ses prix, sans commande), **Commander**. Le défaut du code est
« Commander » : une base neuve est ouverte.

**Fermer, dans cet ordre** — l'inverse coupe les testeurs pendant l'intervalle :

1. dans « Adresses exemptées », ajouter les comptes de test ;
2. **vérifier que chaque ligne affiche « vérifiée »**. « Non vérifiée » ou
   « aucun compte » : l'exemption ne jouera pas. La cause la plus probable est
   côté Auth0 — l'Action `add-email-claim` doit poser l'adresse ET
   `email_verified` sur les jetons **clients** (`platform/auth/auth0-claims.ts`) ;
   ou la personne n'a pas cliqué le lien de vérification ;
3. choisir le niveau.

**Comment savoir que ça a marché** — sans jeton :

```bash
curl -s https://lfd-gateway.lafoliedouce.workers.dev/api/lfd/feature-access
```

(La passerelle est la seule porte publique et retire le préfixe `/api/lfd` —
`documentation/ci-cd/architecture-deploiement.md`.)

Attendu : `{"shop":"browse","orders":"visible","invoices":"visible","desktopMenu":"visible"}`
(ou les niveaux posés — les trois dernières clés ne font que masquer des écrans
de l'app, elles ne ferment rien côté API). Puis, toujours sans jeton,
`POST /orders` ne doit plus passer : un **409** « Les commandes en ligne ne sont
pas encore ouvertes. » — pas un 401, qui dirait seulement qu'il manque un jeton.
Avec le compte d'un testeur exempté, l'app cliente montre la boutique entière.

**Ce qui reste ouvert quel que soit le niveau**, et c'est voulu : la saisie de
commande par le staff (`POST /admin/orders`), les commandes **déjà passées**
(suivi, QR de retrait, règlement, bon), et l'ouverture d'un compte pro.

**Ouvrir** : poser « Commander », ou « Revenir au défaut ». Effet immédiat côté
API (aucun cache) ; l'app cliente le prend au prochain chargement de page.

## Revenir en arrière

Cloudflare garde les versions. Le plus sûr reste de **redéployer le commit
précédent** : l'image est taguée par SHA, donc reproductible.

```bash
git revert <sha> && git push
```

Pour une **migration de base**, il n'y a pas de retour arrière automatique. Un
déplacement de données se fait en trois déploiements — étendre, basculer,
resserrer — précisément pour que chaque étape soit réversible seule.

## Sortir d'Accelerate — la bascule, et son retour arrière

✅ **Jouée le 2026-09-19 au soir** (`07fff0c4`) : la production joint le pooler
mutualisé (`postgres://…@pooled.db.prisma.io`, adaptateur `pg`), et `/health`
publie `"database":"pg"`. Le retour arrière ci-dessous reste possible jusqu'au
resserrement (geste 8). Le
plan et ses raisons : [`plan-sortie-d-accelerate.md`](plan-sortie-d-accelerate.md)
(gestes 6, 7, 7′). Accelerate cesse de répondre le **1er décembre 2026**.

**Avant** (gestes 2 à 4) : les secrets `DATABASE_LFD_PROD_DIRECT_URL` (URL
directe) et `DATABASE_LFD_PROD_URL` (URL **mutualisée**) existent — le second
n'est lu par aucun workflow avant la bascule ; le code de la sortie est en
ligne et `/health` publie `"database":"accelerate"`.

`DATABASE_LFD_URL` **garde la valeur Accelerate** jusqu'au resserrement : c'est
elle, restée dans GitHub, qui fait le retour arrière (décidé par Hugo le
2026-09-19, à la place d'écraser le secret). La copie au gestionnaire de mots
de passe n'est plus qu'une ceinture.

**La bascule** — un seul commit, poussé sur `main`. Dans
`.github/workflows/deploy_lfd_api.yml` :

1. l'étape « Sync runtime secrets » alimente la variable `DATABASE_LFD_URL` du
   container depuis `secrets.DATABASE_LFD_PROD_URL` au lieu de
   `secrets.DATABASE_LFD_URL` — le NOM vu par le container ne change pas ;
2. `EXPECTED_DATABASE_TRANSPORT` passe de `accelerate` à `pg`.

Par un **commit**, jamais par un `gh workflow run` : une révision neuve fait une
instance neuve, qui relit ses `envVars` ; relancer la même image ne prouve rien
(cf. « Après avoir changé une variable GitHub » : les `envVars` ne sont lues
qu'au démarrage).

**Contrôle** — le déploiement échoue de lui-même si le transport servi n'est pas
`pg`. Puis, à la main :

```bash
curl -s https://lfd-gateway.lafoliedouce.workers.dev/api/lfd/health
```

Attendu : `"database":"pg"` et la révision du commit poussé. Ensuite : le
contrôle du mur (plus haut), le nœud `postgres-b2b` de l'écran santé du
back-office (`GET /admin/ops/health`), un écran admin, une connexion client, une
commande de test, les vitals avant / après, et **plus aucun trafic Accelerate**
dans la console Prisma.

**Retour arrière** (geste 7′) — `git revert` du commit de bascule, poussé sur
`main` : la synchro relit `secrets.DATABASE_LFD_URL` (Accelerate) et le contrôle
attend de nouveau `accelerate`. Aucun geste dans GitHub.

Contrôle : `/health` publie `"database":"accelerate"`. Ce retour n'est possible
que **tant que la clé Accelerate n'est pas révoquée** (geste 8), et au plus tard
le 1er décembre 2026.

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

## Avant de déployer « un seul défaut de livraison »

⚠️ **À faire une seule fois, AVANT le merge dans `main`** qui emporte
`20260903190000_un_seul_defaut_de_livraison`.

Cette migration pose un index **unique partiel** sur `addresses`. Sa pose échoue
— sans rien écrire — si une société porte déjà **deux** adresses de livraison par
défaut. Un échec de migration arrête le déploiement en cours de route ; le
constater après coup coûte un aller-retour et une fenêtre d'indisponibilité.

Le contrôle est une **lecture**. Il se passe par `psql`, avec la chaîne relue
dans `Connection strings` de la console Prisma (la console n'a pas d'éditeur
SQL — cf. « Remettre la production à blanc ») :

```sql
SELECT company_id, count(*) AS defauts
  FROM public.addresses
 WHERE kind = 'delivery' AND archived_at IS NULL AND is_default
 GROUP BY company_id
HAVING count(*) > 1;
```

**Zéro ligne ⇒ déployer.** C'était le cas sur dev le 2026-09-03.

**Une ligne ou plus ⇒ ne pas déployer tel quel.** La réparation se fait par une
migration qui précède celle-ci, jamais par un `UPDATE` d'astreinte : une
correction manuelle en production diverge en silence de toute base reconstruite.
La règle de départage est celle du domaine — `DeliveryAddressBook.settleDefault`
garde le défaut en place s'il est valide, sinon promeut **la plus ancienne** :

```sql
UPDATE public.addresses a
   SET is_default = false
 WHERE a.kind = 'delivery' AND a.archived_at IS NULL AND a.is_default
   AND a.id <> (
     SELECT b.id FROM public.addresses b
      WHERE b.company_id = a.company_id AND b.kind = 'delivery'
        AND b.archived_at IS NULL AND b.is_default
      ORDER BY b.created_at ASC LIMIT 1);
```

Ce que ça change pour le client concerné : le formulaire de commande
présélectionne une autre de **ses** adresses. Rien n'est supprimé, rien ne part
ailleurs — une commande **fige** ses lignes postales à la passation. La société
était déjà dans un état indéfini, où l'application choisissait arbitrairement.

**Ce que l'index ne dit pas** : « au moins un défaut ». Un index unique ne compte
pas jusqu'à un. Cette moitié-là n'est tenue que par l'agrégat, qui redresse un
carnet bancal à la lecture — donc seulement pour les sociétés dont quelqu'un
touche les adresses.

## Avant de déployer « un seul détenteur par société »

⚠️ **À faire une seule fois, AVANT le merge dans `main`** qui emporte
`20260903200000_un_seul_detenteur_par_societe`. Même forme que le contrôle
ci-dessus : un index unique partiel, dont la pose échoue — sans rien écrire — si
une société porte déjà deux détenteurs.

```sql
SELECT company_id, count(*) AS detenteurs
  FROM public.memberships WHERE role = 'owner'
 GROUP BY company_id HAVING count(*) > 1;
```

**Zéro ligne ⇒ déployer.** C'était le cas sur dev le 2026-09-03.

**Une ligne ou plus ⇒ ne pas déployer tel quel**, et ne pas trancher en SQL : le
choix « lequel des deux reste détenteur » est **commercial**, pas technique — le
détenteur est celui dont l'adresse a ouvert le compte, et se tromper donne les
clés de l'espace à la mauvaise personne. Remonter la liste, faire trancher, puis
rétrograder les perdants (`role = 'admin'`, qui garde l'accès sans la détention)
dans une migration qui précède celle-ci.

## Avant de déployer « le staff n'entre plus par son adresse »

Lot 0 de [`plan-connexion-sociale.md`](../auth-inscription/plan-connexion-sociale.md)
(2026-09-17). L'accès au back-office refuse désormais un `sub` hors connexion
base de données (Google, Facebook, sans-mot-de-passe…), et ne relie une fiche
par son adresse que si elle est **vérifiée** et **jamais liée**.

**Avant le merge, lire en production** :

```sql
select count(*) from staff_users
where auth0_id is not null and auth0_id not like 'auth0|%';
```

Chaque ligne comptée est un membre qui prendra un `403` au déploiement. Le
geste de sortie est dans le back-office : **renvoyer son invitation**. Elle
rouvre une identité par l'adresse de la fiche, relie la fiche au nouveau `sub`
et envoie un lien de mot de passe — le même geste répare un `sub` mort
(identité supprimée puis recréée chez Auth0).

**L'admin racine** (`BOOTSTRAP_ADMIN_EMAIL`) naît sans lien : c'est le seul
qui entre encore par son adresse. Si elle n'est pas vérifiée chez Auth0 (un
compte créé à la main l'est rarement), il prend un `403` et personne ne peut
l'inviter. Sortie : Auth0 → User Management → l'utilisateur → marquer l'adresse
vérifiée (ou lui envoyer la vérification), puis **se reconnecter** — le claim
n'est relu qu'à la connexion suivante.

**Le tenant** : l'Action `add-email-claim` doit poser `…/email_verified` sur
le jeton de l'audience admin, et Google doit rester coupé sur l'application
admin (fait le 2026-09-17).

**En local** : le bypass (`dev-staff`) et un vrai login Auth0 ne se volent
plus la fiche de l'admin racine. Celle qui l'a liée en premier la garde ;
pour changer, remettre `auth0_id` à `NULL` sur la base **locale**.

## Avant de déployer le fil v11 (les opérations datées)

Lot 2 de [`architecture-operations-datees.md`](../order/architecture-operations-datees.md)
(D10, 2026-09-24). Le fil catalogue passe en **v11** : il transporte les
opérations datées (Noël, Pâques, la galette) et le drapeau « vendu seulement
pendant une opération » des fiches. Les lots 2 et 3 partent **dans le même
merge** — le drapeau et la garde qui refuse la vente vont ensemble.

**Le seul piège : un envoi v10 encore en attente dans la boîte de réception.**
Il reste lisible après le déploiement, et il s'accepte — mais il se lit « aucune
opération » : l'accepter **marque retirées toutes les opérations** du commerce
jusqu'à l'envoi suivant. Ce n'est pas dangereux (aucun article n'y est réservé
aux opérations, donc rien d'exclusif ne se vend), mais l'écran de réception
montrerait Noël « opération retirée » pendant ce temps.

**Avant le merge, lire en production** :

```sql
select id, snapshot->>'version' as version, received_at
  from public.catalog_delivery
 where status = 'pending';
```

- **Zéro ligne ⇒ déployer.**
- **Une ligne en version `10` ⇒** au choix, et dire lequel à l'équipe du
  catalogue :
  1. la faire **accepter avant** le déploiement (écran « Réception » du
     back-office), puis déployer ;
  2. ou déployer, puis **demander un envoi neuf** au référentiel juste après
     (« Publier » côté PIM) : il remplace l'arrivée v10 en attente, qui passe
     `superseded` sans jamais être appliquée.

**Après le déploiement**, un envoi accepté doit remplir le miroir :

```sql
select key, withdrawn_at from public.catalog_operations order by key;
```

Une opération préparée au PIM (non archivée) et présente dans le dernier envoi
accepté a `withdrawn_at` à `NULL`. Si elle manque, relire les exclusions du
dernier push : un article de la sélection non publié est nommé
`operation_article_absent`.

🔴 **Sans retour une fois un envoi v11 posé** : le code v10 ne relit pas une
arrivée v11 en attente. Revenir en arrière après ce point demande d'abord de
vider la boîte de réception (faire accepter, ou attendre un envoi v10 qui la
remplace) — cf. « Sans retour » dans le plan.

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
toute chose, et, depuis la sortie d'Accelerate, que `DATABASE_LFD_PROD_DIRECT_URL`
(celle de la migration) désigne **la même base** que lui.

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

## Faire descendre les mentions d'allergènes sur le catalogue B2B

Symptôme : après le déploiement de la v5 du fil catalogue, l'écran
d'administration du catalogue B2B affiche « sans fiche » sur des articles qui
déclarent pourtant des allergènes.

Ce n'est pas une panne, c'est l'état intermédiaire prévu. La colonne
`public.catalog_items.allergen_labels` naît à `NULL` : aucune migration ne peut
la garnir, la traduction d'un code GS1 en mention d'étiquette demande le
référentiel PIM (D6 de
[`documentation/pim/data-model/05-allergenes-gs1-inco.md`](../pim/data-model/05-allergenes-gs1-inco.md)).
C'est un **push complet** qui la remplit — la republication écrit tous les
articles, décisions commerciales conservées.

La bascule se fait en **trois temps**, et l'ordre compte :

1. **Déployer.** Le PIM projette et envoie `allergenLabels` ; la plateforme
   l'ingère et le stocke. `allergens` (les codes) ne bouge pas — il reste le
   stockage canonique, et l'écran continue de le projeter lui-même.
2. **Pousser tout le catalogue**, une fois, depuis le back-office : _Référentiel
   → Canaux → Plateforme B2B → Publier_ (`POST /pim/channels/b2b/push`,
   `dryRun: false`). Vérifier ensuite qu'il ne reste plus d'article sans
   mentions parmi ceux qui déclarent une fiche :

   ```sql
   SELECT count(*) FROM public.catalog_items
   WHERE allergens IS NOT NULL AND allergen_labels IS NULL;
   ```

   Attendu : `0`. Tant que ce compte n'est pas nul, **ne pas passer au temps 3**.

3. **Seulement alors**, retirer `toInco` / `findMapping` du lecteur B2B
   (`src/b2b/catalog/infrastructure/prisma-catalog-admin.reader.ts`) et servir
   `allergen_labels`.

   🔴 **Le code du temps 3 est écrit et mergé sur `dev` depuis le 2026-09-03.**
   Il ne doit donc pas atteindre `main` avant que la requête du temps 2 rende
   `0` **en production** — le faire avant priverait de mentions tous les
   articles reçus avant le push.

   Ce que ces articles affichent alors, si l'ordre n'est pas tenu : ni les
   mentions, ni « sans allergène », mais le badge rouge **« fiche incomplète »**.
   L'écran dit « une fiche existe et je ne sais pas la rendre », ce qui est vrai.
   C'est gênant et voyant — délibérément : un état intermédiaire qui se voit se
   corrige, un état intermédiaire discret s'installe.

Entre le temps 1 et le temps 3, l'écran projette encore lui-même et n'a donc pas
de trou. Après le temps 3 sans le temps 2, il en a un — d'où l'ordre.

**Pourquoi ce temps 3 n'est pas cosmétique.** Tant qu'il n'est pas fait, la même
affirmation réglementaire a **deux sources** : la boutique lit ce que le PIM a
projeté depuis le référentiel administrable, le back-office le recalcule depuis
une table de 30 codes figée dans le TypeScript (`allergen-mapping.ts`). Le
runbook recommande par ailleurs de créer des **entrées maison**
(`official = false`) — que cette table ne connaîtra jamais. Un article les
déclarant s'affiche correctement en boutique et « fiche incomplète » en rouge au
back-office : l'écran accuse d'un oubli causé par une table que le staff n'a pas
le droit de modifier. Le libellé diverge de même — nom de la catégorie en base
d'un côté, `INCO_LABELS` gelé de l'autre.

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

Puis **retirer les trois modèles de `prisma/schema/pim/regulatory-sheet.prisma`**
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
- **Modèles laissés dans `prisma/schema/pim/regulatory-sheet.prisma`** — le client reste généré contre des
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
(prisma/wipe-business-data.ts, commits du 16/08, retiré par `c6de2e91`) si le
besoin revient.

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

| Ce qu'on voit                                                    | Cause probable                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `500 Container suddenly disconnected` juste après un déploiement | démarrage à froid — réessayer                                                                                                                                                                  |
| `502 upstream injoignable` par la passerelle                     | idem, ou binding absent                                                                                                                                                                        |
| `503 backend non relié`                                          | service binding non déclaré — erreur de configuration                                                                                                                                          |
| CI rouge sur MinIO / Docker Hub                                  | aléa externe — relancer                                                                                                                                                                        |
| Déploiement vert, panne à la 1ʳᵉ requête                         | connexion Prisma paresseuse : le boot ne teste rien                                                                                                                                            |
| Déploiement rouge « joint la base par … »                        | `DATABASE_LFD_URL` et `EXPECTED_DATABASE_TRANSPORT` ne disent pas le même transport — cf. « Sortir d'Accelerate »                                                                              |
| `persistence.database_unavailable` en rafale, sans panne franche | après la bascule : pool `pg` saturé — `P2037` (le pooler refuse), ou 5 s sans connexion libre dans l'instance ; ce que le pooler distant renvoie à saturation n'a pas été éprouvé (2026-09-19) |
| Front qui appelle une vieille URL                                | variable changée sans redéploiement                                                                                                                                                            |
