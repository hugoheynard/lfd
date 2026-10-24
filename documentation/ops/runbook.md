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

La migration passe par le secret **`DATABASE_LFD_PROD_DIRECT_URL`** (URL
directe), pas par celui du container ; absent, elle échoue en le nommant — cf.
[`base-de-production.md`](base-de-production.md).

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

## Fermer ou ouvrir la boutique en ligne — ce geste n'existe plus

> ⚠️ **Retiré le 2026-10-09** (Hugo). La clé « Boutique » (`shop`) a quitté
> l'accès aux fonctionnalités, avec « Mes commandes », « Mes factures », « Menu
> au bureau » et « Livraison aux particuliers » : la boutique est **toujours
> ouverte à la commande**, et ces écrans toujours montrés. Il n'y a plus de
> réglage pour fermer la vente en ligne ; la fermer demanderait un déploiement.
>
> La livraison aux particuliers ne se règle plus que dans **« Livraison »**
> (`/b2b/reglages`, case B2C — `openToB2c`), que le serveur oppose au devis et
> à la passation, avec ou sans compte.

`/admin/feature-access` ne porte plus que le **mandat SEPA client**
(`customerMandate`, fermé par défaut, sans exemption possible).

**Comment savoir ce qui est servi** — sans jeton :

```bash
curl -s https://lfd-gateway.lafoliedouce.workers.dev/api/lfd/feature-access
```

(La passerelle est la seule porte publique et retire le préfixe `/api/lfd` —
`documentation/ci-cd/architecture-deploiement.md`.)

Attendu : `{"customerMandate":"closed"}` (ou `"open"` si l'admin l'a ouvert).

**Les lignes d'avant ne sont pas effacées.** Une dérogation ou une exemption
posée sur une clé retirée reste en base ; l'écran la liste en tête, sous
« Des lignes en base ne correspondent pas au catalogue », et rien ne
l'applique. Ce n'est pas une panne à corriger.

## Revenir en arrière

Cloudflare garde les versions. Le plus sûr reste de **redéployer le commit
précédent** : l'image est taguée par SHA, donc reproductible.

```bash
git revert <sha> && git push
```

Pour une **migration de base**, il n'y a pas de retour arrière automatique. Un
déplacement de données se fait en trois déploiements — étendre, basculer,
resserrer — précisément pour que chaque étape soit réversible seule.

## La base de production — pas de retour à Accelerate

La production joint le pooler mutualisé (`postgres://…@pooled.db.prisma.io`)
par l'adaptateur `pg` depuis le 2026-09-19, et l'API **refuse de démarrer** sur
une URL `prisma+postgres://` depuis le 2026-09-22. Il n'existe donc **aucun
retour arrière vers Accelerate** : ni secret qui en garde la valeur (supprimé
de GitHub), ni code qui saurait la servir. Une panne de base se traite sur le
pooler ou l'URL directe, jamais en revenant en arrière. Transport, secrets et
pool : [`base-de-production.md`](base-de-production.md).

## Mettre en service le planificateur de tournées (`lfd-route-planner`)

Préalable, depuis le renommage du 2026-09-29 (ex-`lfd-osrm`, jamais déployé) :
créer le secret GitHub `ROUTE_PLANNER_TOKEN`
(`openssl rand -base64 48 | tr -d '\n' | gh secret set ROUTE_PLANNER_TOKEN`),
puis supprimer l'ancien (`gh secret delete OSRM_TOKEN`) — un secret GitHub ne
se renomme pas et ne se relit pas.

Trois déploiements séparés, dans cet ordre, chacun vérifié avant le suivant :
**(1)** `lfd-route-planner` par son workflow ; **(2)** la passerelle, qui gagne
`/api/route-planner` et pose le jeton `ROUTE_PLANNER_TOKEN` — elle échoue à la publication si
`lfd-route-planner` n'existe pas ; contrôle `curl` : 401 sans jeton, 200 avec ;
**(3)** la variable `ROUTE_PLANNER_URL=https://lafoliecoffee.info/api/route-planner`, puis un
redéploiement de l'API, qui lit le même secret `ROUTE_PLANNER_TOKEN`. Contrôles,
retour arrière et rotation du jeton :
[`planificateur-de-tournees.md`](planificateur-de-tournees.md#mettre-en-service--lordre-une-étape-à-la-fois).

⚠️ Retirer `ROUTE_PLANNER_URL` (ou `ROUTE_PLANNER_TOKEN_NEXT`) des réglages GitHub ne le retire
pas du Worker : les workflows ne font que poser. Le geste complet
(`wrangler secret delete`) est dans la même page.

## Savoir ce que l'instance en ligne sait faire

Un réglage absent n'est pas une erreur : c'est une **capacité éteinte**, et
l'app le sait. Pour le lui demander :

```bash
curl -s https://<api>/admin/ops/capabilities -H "x-lfc-recompute-token: <jeton>"
```

Elle rend la révision servie et la liste des canaux éteints — la capacité en
mots métier, la variable à poser, ce qui ne marchera pas. Rien de secret n'en
sort : l'inventaire ne manipule que des booléens.

**Sans jeton ni journal**, le même inventaire se lit dans le back-office :
OPS → Santé, carte **« Capacités »** (droit `ops_health`, route
`GET /admin/ops/capabilities/staff`). Elle passe en tête de page dès qu'une
capacité est bloquante, et suit les briques sinon ; « Tout est branché » quand
la liste est vide. Chaque ligne dit la capacité, sa gravité, ce qu'elle
empêche et le NOM de la variable — jamais sa valeur. Le geste de sortie est
celui écrit sur la carte : poser la variable dans les secrets du workflow
`deploy_lfd_api.yml`, puis redéployer — un secret posé ne relance rien. Les
deux routes lisent le même bulletin de démarrage ; celle au jeton reste celle
du cron et de l'exploitation.

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

## Après avoir déployé « Nous écrire » : accorder `b2b_contact`

La migration `20261009140000_nous_ecrire` ajoute la ressource `b2b_contact`
(objets de contact, carte de contact, messages reçus) **sans l'accorder à
personne** — une migration n'écrit jamais un droit
(`lint:no-role-grants-in-migrations`). Tant que rien n'est fait, les pages
« E-commerce LFC › Contact » répondent 403 à tout le monde, administrateur
compris, et la cloche « Nous écrire » ne sonne chez personne.

**Le geste, juste après le déploiement** : `/admin/staff-roles`, rôle
« Administrateur », ressource « Nous écrire » → écriture ; puis tout autre rôle
qui doit lire ou traiter les messages. Plan :
[`demandes-clients.md`](../demandes-client/demandes-clients.md), §5.6.

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

## Après avoir déployé « l'invitation expirée refusée à l'entrée »

Migration `20261010140000_l_invitation_du_rattachement` (2026-10-10,
[`architecture-compte-client-cycle-de-vie.md`](../auth-inscription/architecture-compte-client-cycle-de-vie.md)
§8.1 bis). L'entrée — client et staff — refuse désormais une invitation de
plus de 7 jours. La migration donne une **grâce** : toute invitation en cours
repart de l'instant du déploiement.

**Juste après le déploiement, lire en production** — les deux doivent rendre `0` :

```sql
-- une personne invitée dont un rattachement n'a pas reçu la grâce
select count(*) from memberships m join users u on u.id = m.user_id
where u.status = 'invited' and m.invited_at < now() - interval '1 hour';

-- une fiche staff invitée sans date d'invitation (elle serait refusée)
select count(*) from staff_users where status = 'invited' and invited_at is null;
```

**Sept jours après** : les invitations non acceptées d'ici là ferment. La
cloche « Invitation expirée » sonne chez les détenteurs de
`b2b_companies:write` (client) ou de `staff_access:write` (équipe) à la
première tentative de la personne ; le geste de sortie est un **lien neuf**
depuis la fiche de la société, ou une réinvitation depuis l'annuaire.

⚠️ La boutique n'affiche pas encore le message du refus (`account.invitation.expired`) :
la personne voit des écrans en erreur, sans explication. C'est la cloche qui
prévient le commercial.

**Retour arrière** : aucun. Retirer `invited_at` / `accepted_at` rouvrirait
le trou que la migration ferme.

## Le push et la réception du catalogue — partis en X2

Les sections « Avant de déployer le fil v11 » et « Faire descendre les
mentions d'allergènes sur le catalogue B2B » décrivaient des gestes du push
(« Publier ») et de la boîte de réception (« Réception »). Les deux sont
retirés du code le 2026-10-17 (X2 de
[`catalogue-synchronise.md`](../catalogue/catalogue-synchronise.md) §6) : le
catalogue descend par ses faits, fiche par fiche. Le geste qui les remplace
est la **réémission** (ci-dessous) ; le contrôle, l'écran « Catalogue
publié ». Leur texte est dans l'historique
git.

## Réémettre le catalogue — une fiche, ou tout

Le **filet** des faits du catalogue
([`catalogue-synchronise.md`](../catalogue/catalogue-synchronise.md) §2) :
une fiche en retard sur la plateforme — vue sur « Catalogue publié » — se
répare en réémettant son fait. Depuis le 2026-10-18, c'est un **geste à
l'écran**, suivi comme un travail. Il demande **`pim_channels:write`** : sans
ce droit, les boutons ne s'affichent pas.

**Le geste** :

- **une fiche** : la fiche du référentiel, rail « Publication », carte
  « Réémettre vers la plateforme », bouton **Réémettre** ;
- **tout** : Référentiel › **Intégrations** (`/pim/integration`), carte
  « Réémettre le catalogue », bouton **Tout réémettre** — familles, puis
  fiches (une transaction chacune), puis les règles. Le 2026-10-17, 293
  articles en ~73 s.

La réponse part tout de suite ; l'écran relit le travail toutes les 1,5 s
jusqu'à ce qu'il soit **Terminée** ou **Arrêtée**. Fermer l'écran n'arrête
pas la réémission : la page Intégrations montre en s'ouvrant la dernière, et
la suit si elle tourne encore.

**Lire le compte rendu** (sur la carte, ou `GET /pim/channels/b2b/reemit/latest`) :

- **Fiches tentées** compte les fiches essayées, échecs compris ; **Fiches
  réussies** celles parties ;
- **Terminée** avec des fiches en échec : chacune est nommée avec sa raison,
  et mène à sa fiche — la réémettre seule depuis là ;
- **Arrêtée** : la raison est écrite sous l'état —
  - une **famille** en échec : avant la première fiche, rien n'est parti ;
    relancer ;
  - les **règles** en échec : toutes les fiches comptées sont parties ;
    relancer est sans risque ;
  - « **Interrompu par un redémarrage** du serveur » : le processus qui
    tenait le travail s'est arrêté (déploiement, plantage) ; les fiches
    comptées sont parties, relancer.
- « Une réémission de tout le catalogue est déjà en cours » (409) : en
  attendre l'issue sur la page Intégrations. Une fiche seule, elle, part
  même pendant un « tout ».

Sans écran (agent, ou API directe), le même geste :

```http
POST /pim/channels/b2b/reemit
{ "productId": "<id de la fiche>" }      → 202 { "id": "<travail>" }
GET  /pim/channels/b2b/reemit/<travail>  → le compte rendu
```

`productId` absent ou `null` = tout ; une fiche inconnue répond 404. Pour un
agent : `pim_catalog_reemit` puis `pim_catalog_reemission_status`
([`outils-webmcp-pim.md`](../pim/outils-webmcp-pim.md)).

**Contrôle** : une fiche vue sur « Catalogue publié » prouve **cette** fiche.
Pour « tout », comparer le nombre de fiches publiées au référentiel au nombre
d'articles servis sur « Catalogue publié » ; et la carte de santé `ops` (boîte
d'envoi vide, aucune lettre morte). **Retour arrière** : sans objet —
réémettre ne fait que republier l'état du référentiel, le plus récent gagne.

## Passer au prix pro saisi (lot S) — l'ordre, et le retour

Lot S de [`plan-catalogue-synchronise-par-audience.md`](../catalogue/plan-catalogue-synchronise-par-audience.md).
Le prix pro HT **saisi** par déclinaison devient la seule source ; le rapport
pro / public n'est plus qu'une suggestion. Le code est déployé sans rien
changer de servi : une base qui a déjà une ligne de règles garde sa méthode
(`ratio_ttc`) jusqu'au geste (3). Les trois gestes sont à Hugo, **dans cet
ordre**, depuis _Règles comptables_ (ou par l'API, droit `pim_tax:write`).

🔴 **Le vrai basculement est le geste (2), pas le (3).** Une fois le
pré-remplissage écrit, chaque déclinaison a sa saisie, et la saisie prime :
**le prix public ne bouge plus le prix pro.** Monter un prix public après (2)
ne monte plus le prix pro, sur tout le catalogue. C'est l'objet du lot.

**1. Relire l'aperçu du pré-remplissage** — lecture seule :

```http
GET /pim/accounting-rules/pro-price-prefill
```

- `mismatches` vaut `0` (sous `ratio_ttc`, le HT pré-rempli doit être, au
  millicentime, celui que la boutique pro sert aujourd'hui) ;
- les lignes `no_vat_b2b` et `no_price` **ne sont pas remplies** : elles
  sortiront du catalogue pro au geste (3). Les compléter avant (taux `b2b` de
  la famille ou de la fiche, prix public), ou accepter leur sortie ;
- les lignes `aligned` suivent leur défaut (`followsSku`) ; `alignedCause` non
  nul dit pourquoi le défaut ne sera pas rempli, donc pourquoi elles sortiront.

**2. Écrire** :

```http
POST /pim/accounting-rules/pro-price-prefill
```

Refusé (`catalogue.pro_price_prefill.mismatch`) au moindre écart. La réponse
est l'aperçu relu : `toPrefill` vaut `0`. Un fait
`product.pro_price_prefilled` par déclinaison écrite. Entre (2) et (3), rien de
servi ne change.

**3. « Passer au prix saisi »** (le bouton de l'encart, ou) :

```http
PUT /pim/accounting-rules/pro-price-method
{ "method": "entered" }
```

Le catalogue est réémis. Après (3), seule une déclinaison **sans saisie** sort
du catalogue pro (motif `variant_sans_prix_pro`, ou `variant_sans_taux` quand
c'est le taux qui manque). Contrôle : l'écran « Catalogue publié » (la
parité est partie en X2), puis relire l'aperçu — `toPrefill` à `0`.

### Le retour arrière

**Le retour arrière d'un prix pro est une saisie**, fiche par fiche : corriger
le « Prix pro HT » de la déclinaison, ou l'effacer — sans saisie, la
déclinaison retombe sur le repli de la méthode (aucun sous « prix saisi »).

Revenir à `ratio_ttc` (`PUT …/pro-price-method { "method": "ratio_ttc" }`,
l'écran ne l'offre plus) est **illusoire après (2)** : la saisie prime, et ce
retour ne toucherait que les déclinaisons sans saisie. Il ne rend pas « le
prix public bouge le prix pro ».

## Basculer les opérations au commerce — l'ordre, et le retour

**Fait le 2026-10-16** (0 opération au référentiel, rien à reprendre).
L'interrupteur `OPERATIONS_AT_COMMERCE` est retiré du code le 2026-10-17 (X1 de
[`catalogue-synchronise.md`](../catalogue/catalogue-synchronise.md) §6), et
`/pim/operations` entier par X4 le même jour : la route n'existe plus
(aucun contrôleur ne la déclare, vérifié le 2026-10-17). Le
retour arrière est un revert suivi d'un redéploiement.

## Transférer le droit du catalogue (`b2b_catalog` → `lfc_catalog`) — l'ordre, et la condition de L2

Plan : [`plan-droit-lfc-catalog.md`](../droits-et-permissions/plan-droit-lfc-catalog.md).
Le lot L1 (bâti le 2026-10-16) ajoute la ressource « Catalogue publié »
(`lfc_catalog`, migration `20261016100000_le_droit_du_catalogue_publie`) **sans
l'accorder à personne** et **sans déplacer aucune garde** : les écrans du
catalogue restent sous « Catalogue vendu » (`b2b_catalog`). Aucune migration ne
recopie un droit, et il n'y a pas de bouton « tout recopier ».

**1. Déployer L1.** Rien ne change pour personne.

**2. Ouvrir l'aperçu** : Admin › Rôles, carte « Transfert : Catalogue vendu →
Catalogue publié » (ou `GET /admin/staff-access/catalog-right-transfer`, sous
`staff_access:read`). Une ligne par rôle (archivés compris) et par dérogation
qui porte l'un des deux droits.

**3. Pour chaque ligne, à l'écran, dans cet ordre :**

- **Rôle** (`/admin/staff-roles` › Modifier) : accorder « Catalogue publié »
  **au même niveau** que « Catalogue vendu », enregistrer ; **puis** retirer
  « Catalogue vendu », enregistrer. Le rôle archivé se traite aussi : remis en
  service après L2, il rendrait ce qu'il portait.
- **Dérogation** (fiche de la personne) : recopier la même dérogation sur
  « Catalogue publié », **même action, même effet**, puis retirer celle sur
  « Catalogue vendu ». ⚠️ Un **retrait** non recopié (« retrait à recopier »)
  est un accès **gagné** à la bascule, dès que le rôle reçoit le nouveau droit.

**4. La condition de L2** : l'aperçu affiche **« Sans écart »** (`clear: true`),
c'est-à-dire qu'aucun rôle ni aucune dérogation ne porte plus `b2b_catalog`, et
que chacun tient `lfc_catalog` au même niveau et au même effet. Tant que ce
n'est pas le cas, **ne pas déployer L2** : un rôle oublié y perd le catalogue.

⚠️ **La fenêtre sans catalogue est ACCEPTÉE** (Hugo, 2026-10-16, option a).
Entre le retrait de « Catalogue vendu » et le déploiement de L2, les écrans du
catalogue sont **fermés** à ceux qui l'ont perdu (les gardes sont encore sur
l'ancien droit). Le geste est donc : retirer « Catalogue vendu » à l'écran,
**puis déployer L2 dans la foulée** — pas le lendemain.

**5. Déployer L2** (bâti le 2026-10-16). Les gardes passent sur
`lfc_catalog`, serveur et front. `b2b_catalog` devient **retiré** : il reste
lisible en base (sans quoi un rôle qui le porterait encore perdrait TOUS ses
droits), mais il n'ouvre plus rien, ni par un rôle ni par une dérogation, et
ne s'accorde plus — le serveur refuse (400 `staff.resource_retired`) de
l'ajouter ou d'en changer le niveau. Une ligne oubliée se voit à l'écran des
rôles ou sur la fiche, marquée « Retiré — à enlever », et le seul choix
proposé est de l'enlever. Les nouvelles notifications par audience
s'adressent à `lfc_catalog:*`.

**Les notifications** : l'aperçu compte celles d'audience `b2b_catalog:*`
encore non lues. Elles ne seront plus visibles après L2 (décision du
2026-10-16 : perdues, sans réadressage) — les lire avant si elles comptent.

**Retour arrière** : avant L2, rien à défaire (la valeur d'enum reste, inutilisée).
Après L2, redéployer L1 rouvre les gardes sur `b2b_catalog` — qui n'est plus
porté par personne : il faut le réaccorder à l'écran (l'écran de L1 le
propose encore ; celui de L2 non).

## Déployer la fidélité en Gestion Boutique (`lfc_loyalty`) — F1 et F2 ensemble

Plan : [`plan-fidelite-en-gestion-boutique.md`](../comptabilite/fidelite/plan-fidelite-en-gestion-boutique.md).
F1 (migration `20261016230000_le_droit_de_la_fidelite`, valeur d'enum seule,
aucun droit accordé) et F2 (l'écran `/fidelite`, la route `admin/loyalty`,
toutes les gardes sur `lfc_loyalty`) partent **ensemble** sur `main` (Hugo,
2026-10-16).

**1. Déployer.** Dès lors, la fidélité n'est plus en Comptabilité :
`b2b_accounting` garde tout le reste, mais **n'ouvre plus la fidélité**.

**2. Juste après, à l'écran `/admin/staff-roles`** : accorder « Fidélité »
(`lfc_loyalty`) aux rôles qui **gèrent la boutique** — lecture pour voir,
écriture pour régler, ajuster un solde, annuler un bon. Jamais par migration.
⚠️ **La comptabilité ne la garde pas** (Hugo, 2026-10-16) : ne pas l'accorder
au rôle comptable par réflexe.

⚠️ **La fenêtre est ACCEPTÉE** (Hugo, 2026-10-16) : entre le déploiement et
cet accord, **seul le superadmin ouvre la fidélité**. Rien n'est perdu ni
gagné — un rôle sans le droit voit l'entrée disparaître et reçoit 403 sur
`admin/loyalty` ; le gain de points et le passage de nuit
(`admin/loyalty/sweep`) ne dépendent d'aucun droit staff et continuent.

**Retour arrière** : redéployer l'état d'avant F2 rouvre la fidélité sous
`b2b_accounting`. La valeur d'enum reste, inutilisée.

## Déployer le lot D — le prix ne se décide plus sur la plateforme

Lot D de [`plan-catalogue-synchronise-par-audience.md`](../catalogue/plan-catalogue-synchronise-par-audience.md)
(2026-10-15). Les routes `PUT|DELETE admin/catalog/:sku/price` et
`:sku/public-price` disparaissent ; le prix servi devient celui du
référentiel. **Aucune migration** : les colonnes
`catalog_item_overrides.price_millicents` et `decided_public_ttc_cents`
restent en base, ni lues ni écrites, et aucune ligne n'est supprimée.

🔴 **Ce qui change de servi dès le déploiement** : un article dont le prix
avait été remplacé sur la plateforme se vend au prix du référentiel.

**1. Avant de pousser `main` — le relevé en production** (lecture seule) :

```sql
select count(*)
  from public.catalog_item_overrides
 where price_millicents is not null or decided_public_ttc_cents is not null;

select o.sku, i.name, o.price_millicents, i.price_millicents as referential_millicents,
       o.decided_public_ttc_cents, i.public_ttc_cents as referential_ttc_cents,
       o.decided_by, o.decided_at
  from public.catalog_item_overrides o
  join public.catalog_items i on i.sku = o.sku
 where o.price_millicents is not null or o.decided_public_ttc_cents is not null
 order by o.sku;
```

- **Zéro ligne ⇒ déployer.**
- **Des lignes ⇒** Hugo choisit celles à garder, et les **reporte en prix pro
  HT saisi** dans les fiches du référentiel (lot P) **avant** le déploiement.
  Garder la sortie de la seconde requête : c'est la seule liste des prix qui
  cessent d'être servis.

**2. Après le déploiement — retracer** (droit d'écriture du catalogue,
`b2b_catalog:write`, journalisé) :

```http
POST /admin/catalog/prices/retrace
```

Réponse `204`. Le tarificateur relit les prix passés dans l'historique
(`catalog_price_history`), dont la dernière ligne d'un article était peut-être
l'ancien prix décidé : sans ce geste, une lecture datée — le tableau de
tarification, un devis à une date — rendrait ce prix indéfiniment pour un
article que rien ne touche. Le geste écrit une ligne pour chaque article vendu
dont la dernière trace diffère du référentiel, et rien d'autre. Un fait
`catalog_price_history.retraced` liste les SKU au journal.

**Contrôle** — un second appel n'écrit rien (aucun nouveau fait), et :

```sql
select count(*)
  from public.catalog_items i
  join lateral (
    select price_millicents from public.catalog_price_history h
     where h.sku = i.sku order by recorded_at desc limit 1
  ) last on true
 where i.withdrawn_at is null and last.price_millicents <> i.price_millicents;
```

rend `0`.

**Retour arrière** : redéployer la version précédente rend les routes et la
lecture des colonnes, qui n'ont pas bougé. Les lignes retracées restent dans
l'historique — elles disent le prix réellement servi pendant l'intervalle.

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
toute chose, et que `DATABASE_LFD_PROD_DIRECT_URL`
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

## Abonner le webhook Stripe aux liens de paiement

Les **liens de paiement libres** (plan
[`blocage-et-liens-de-paiement.md`](../comptabilite/prelevement/blocage-et-liens-de-paiement.md)
§2b) sont des pages Stripe Checkout hébergées. Stripe ne prévient le backend
que des événements auxquels l'endpoint est **abonné** — et un événement non
abonné ne produit **aucune erreur** : le lien reste `open` pour toujours alors
que le client a payé.

Le geste, dans le tableau de bord Stripe (Développeurs → Webhooks), sur
l'endpoint **déjà branché** sur `POST /payments/webhook` — celui qui reçoit
`payment_intent.succeeded` et `payment_intent.payment_failed`. Ne pas en créer
un second : il aurait son propre secret de signature, que le backend ne connaît
pas, et chacun de ses appels serait refusé en `400`.

Ajouter ces **trois** événements aux deux déjà cochés :

| Événement                                  | Ce qu'il fait chez nous                             |
| ------------------------------------------ | --------------------------------------------------- |
| `checkout.session.completed`               | lien → `paid`, seulement si `payment_status = paid` |
| `checkout.session.async_payment_succeeded` | lien → `paid` (moyen de paiement différé)           |
| `checkout.session.expired`                 | lien `open` → `expired`                             |

**Vérifier** : créer un lien d'un euro depuis l'onglet « Liens libres », le
payer avec une carte de test (en mode test), puis relire la liste — le lien doit
être « payé ». Dans Stripe, l'onglet de l'endpoint montre la livraison de
`checkout.session.completed` en `200`. Un `200` avec un lien resté ouvert veut
dire que la session ne porte pas la métadonnée `paymentLinkId` : ce n'est pas
une page ouverte par le back-office.

## Abonner le webhook Stripe aux remboursements

> 📐 **À faire, pas fait** (2026-10-08, lot R1 de
> [`facture-carte-et-remboursements.md`](../comptabilite/facturation/facture-carte-et-remboursements.md)).
> Le code est prêt ; l'abonnement de l'endpoint de production n'a pas été posé.

Un remboursement se fait **dans le tableau de bord Stripe** ; le backend le
**constate** (table `order_refund`, règlement `refunded` au total, journal).
Comme pour les liens libres, un événement non abonné ne produit **aucune
erreur** : la commande reste « payée » alors que l'argent est rendu.

Le geste, dans le tableau de bord Stripe (Développeurs → Webhooks), sur
l'endpoint **déjà branché** sur `POST /payments/webhook` — jamais un second
(il aurait son propre secret, et chacun de ses appels serait refusé en `400`).

Ajouter ces **trois** événements à ceux déjà cochés :

| Événement        | Ce qu'il fait chez nous                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| `refund.created` | note le remboursement (souvent `pending`, parfois déjà réussi)           |
| `refund.updated` | change son statut : réussi, annulé, action requise                       |
| `refund.failed`  | un remboursement échoue — s'il était réussi, la commande redevient payée |

⚠️ **Ne pas compter sur `charge.refunded`** : depuis l'API Stripe 2022-11-15,
il ne porte plus la liste des remboursements, et le backend l'ignore.

**Vérifier** (mode test) : payer une commande par carte de test, la
rembourser en partie depuis Stripe, puis ouvrir sa fiche au back-office — la
carte « Remboursements » montre le montant, « Remboursé ». Rembourser le reste :
le règlement passe « Remboursée ». Dans Stripe, l'onglet de l'endpoint montre
les livraisons en `200`. **Un `200` répond aussi à un refus** (devise autre que
l'euro, cumul au-delà du total) : il se lit alors à la cloche du back-office et
au journal (« … n'a pas été noté »), jamais en erreur chez Stripe — un réessai
ne le rendrait pas plus vrai. Un remboursement sur un paiement qu'aucune
commande ne porte (un lien libre) sonne aussi la cloche, sans rien écrire.

## Le webhook de la vitrine — mise en service, abonné en échec, rotation de clé

> Bâti le 2026-10-18 (lot W,
> [`vitrine.md`](../webhooks/vitrine.md)). Écran :
> Admin › **Webhook vitrine** (`/admin/webhook-vitrine`, rangé là le 2026-10-19 ;
> l'ancienne adresse `/webhook-vitrine` redirige), sous le droit
> `lfd_webhooks` (« Webhooks »), qui remplace `shop_vitrine` depuis le
> 2026-10-19 (Hugo).

**Après le déploiement : accorder `lfd_webhooks`.** La migration
`20261019120000_le_droit_des_webhooks` ajoute la ressource **sans l'accorder à
personne** (`lint:no-role-grants-in-migrations`), et ne recopie pas les accords
de `shop_vitrine` : tant que rien n'est fait, l'entrée n'apparaît chez personne
et `/admin/vitrine/*` répond 403, administrateur compris. Le geste :
`/admin/staff-roles`, rôle « Administrateur » — et tout rôle ou dérogation qui
portait « Webhook de la vitrine (retiré) » — ressource « Webhooks » → même
niveau. `shop_vitrine` n'ouvre plus rien ; sa ligne peut être retirée au même
moment.

**Déclarer l'agence** : « Nouvel abonné », son adresse `https://…` (sans `?`
ni `#` : refusée à la saisie), ses cases. Le **secret de signature** et la
**clé de lecture** ne s'affichent qu'à ce moment : les lui transmettre par un
canal sûr. Puis « Envoyer un test » : le journal des envois dit « Livré » si
l'agence a répondu 2xx. Sans abonné allumé, le balayage du cron (`*/5`,
`POST /admin/vitrine/sweep`) ne calcule rien.

**Un abonné « En échec »** : une notification a épuisé ses dix essais (de
30 s à 6 h, la politique de l'outbox). Plus rien ne lui part, et rien ne se
perd : le balayage continue de ne rien comparer pour lui. Le journal des envois
dit pourquoi (`HTTP 503`, « injoignable », « envoi refusé : … désigne une
adresse de réseau privé »). Quand l'agence répond à nouveau : **« Tout
renvoyer »** — l'échec est levé et le prochain passage (cinq minutes au plus)
annonce TOUT comme changé, en une notification. « Rallumer » seul ne lève pas
l'échec.

**🔴 Tourner `FIELD_ENCRYPTION_KEY` rend illisibles les secrets de signature
des abonnés** (scellés sous cette clé, comme les IBAN). Les envois échouent
alors avec « secret de signature illisible (la clé de chiffrement a changé) »,
puis l'abonné passe en échec. Le geste, juste après la rotation, pour CHAQUE
abonné : « Régénérer le secret et la clé », transmettre les neufs à l'agence,
puis « Tout renvoyer » s'il est passé en échec. La clé de lecture, elle, est
hachée et ne dépend pas de la clé de chiffrement — mais la régénération la
remplace aussi : l'agence doit mettre à jour les deux.

**Une annonce interrompue** (2026-10-19) : un redémarrage pendant « Notifier
les abonnés » laisse des destinataires « Pas tenté » aux dernières annonces.
Le geste : « Reprendre l'envoi » sur l'annonce — il n'écrit qu'à eux, sous la
même clé Resend (un e-mail déjà accepté ne repart pas). Un destinataire
« Non envoyé » n'est pas repris : lui écrire par une nouvelle annonce.

**Un balayage « écarté »** dans les logs (`SweepVitrineHandler`, « le
précédent passage tient encore le bail ») : deux passages du cron se sont
chevauchés, le second n'a rien fait — c'est le bail qui joue son rôle. Répété
à chaque passage, il dit qu'un balayage dure plus de cinq minutes : le
mesurer. Un balayage tué en route libère le bail au bout de quinze minutes.

## Verrouiller les PDF des factures pour dix ans

> 📐 **À faire, pas fait** (2026-10-08, lot E3b de
> [`facture-emise.md`](../comptabilite/facturation/facture-emise.md)).
> Personne n'a encore posé la règle ; l'état du seau n'a pas été relu.

Chaque facture et chaque avoir émis ont leur PDF/A-3 Factur-X rangé dans le
seau **`customers`** (celui du port `CustomerDocumentStore`), sous
`invoices/<id de l'entité émettrice>/<numéro>.pdf`. Le code ne sait pas
supprimer dans ce seau (le verbe n'existe pas), ne réécrit jamais une clé, et
compare l'empreinte SHA-256 figée sur la pièce avant de servir le fichier.
**Ce qui manque est le verrou** : l'empreinte prouve qu'un fichier a changé,
elle ne l'empêche pas. La conservation est de dix ans (Code de commerce, de
mémoire — à confirmer par le cabinet).

Le geste, dans le tableau de bord Cloudflare (R2 → le seau `customers` de
production → Settings → **Bucket lock rules**) :

| Champ     | Valeur                                       |
| --------- | -------------------------------------------- |
| Préfixe   | `invoices/`                                  |
| Rétention | 10 ans (ou la durée que le cabinet confirme) |

⚠️ **Irréversible dans les faits** : un objet sous verrou ne se supprime ni ne
se remplace avant l'échéance, même par erreur, même par Hugo. C'est le but.
Le préfixe est `invoices/`, et rien d'autre : les bons de commande du même
seau (`orders/`) n'ont pas cette durée.

**Vérifier** : émettre une facture sur un poste de recette, puis tenter un
remplacement de l'objet par `wrangler r2 object put` sur la même clé — il doit
être refusé. Relire le PDF depuis l'écran « Comptabilité → facture » : il se
télécharge toujours.

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
   du paquet ne soit reconstruit — puis plus rien ne redémarrait. Corrigé
   d'abord par un compagnon qui touchait `src/main.ts` ; depuis le 2026-10-08,
   par `dev-toolbox/api-dev.mjs` (le `dev` de `lfd-api`), qui remplace
   `nest start --watch` : `tsc --watch` émet même en erreur de type, et Node est
   relancé 400 ms après le dernier `.js` écrit dans `apps/lfd-api/dist` ou un
   `packages/*/dist`. Le compagnon avait un trou : un paquet vu à moitié écrit
   faisait échouer la compilation de Nest, qui ne relance plus après une erreur
   — l'API restait morte sans rien dire. Le lanceur relance aussi une API
   morte seule (2 s, 5 s, 15 s, puis 30 s) et une API muette sur `/health`
   depuis 60 s ; chaque relance s'écrit en une ligne `[api-dev]`.

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

## Avant de promouvoir le retrait de l'ancien canal (2026-10-16)

Deux migrations partent ensemble : `20261016200000_le_canal_retire_sans_son_nom`
(renomme les clés des faits des points de vente, renomme le canal des
publications de révision, supprime le suffixe de handle et la colonne de
projection de l'ancien canal de `pim.sales_context`), puis
`20261016210000_le_canal_retire_efface` (retire ces clés des faits, supprime
les modifications qui ne portaient qu'elles, et les publications de l'ancien
canal). Ordre de Hugo, 2026-10-16.

🔴 **Irréversible.** Les clés retirées, les faits supprimés et les deux
colonnes n'ont aucune copie. Faire une sauvegarde juste avant.

**La mesure d'avant est faite** (Hugo, 2026-10-16, lecture seule sur la
production) : 0 fait à nettoyer, 0 publication de l'ancien canal, 1 point de
vente avec un suffixe et « projeté ». Les chiffres sont gardés dans
[`pim/retrait-de-l-ancien-canal.md`](../pim/retrait-de-l-ancien-canal.md).

**La fenêtre** : la migration passe avant le `wrangler deploy`
(`deploy_lfd_api.yml`). Pendant ces secondes, l'ancien code peut lire une
colonne disparue (500 sur l'écran des points de vente). Accepté en
pré-release ; ça se résorbe avec le déploiement. (La « dernière publication »
que citait ici une phrase n'est plus affichée nulle part depuis le
2026-10-17 : le repère est retiré.)

**Après** : ouvrir un point de vente existant au back-office, l'enregistrer,
puis ouvrir son historique — il doit se lire sans fait brut.

## Une remise ne se défait pas — même à la main (depuis le 2026-10-24)

Depuis la migration `20261024150000_la_reception_suit_la_remise`, la base
refuse de revenir sur une remise : `received_on` est figé une fois posé
(déclencheur `orders_received_on_frozen`), et deux CHECK tiennent « remise ⇒
date » et « date ⇒ remise ». Remettre `handed_over_at` à `NULL` est donc
refusé, avec ou sans la date. C'est voulu (décision Q4 de
[`date-de-reception.md`](../commandes/la-commande/date-de-reception.md)) : la
date de réception entre dans la facture.

Une remise constatée par erreur ne se corrige pas en base. La lever
demanderait de retirer une contrainte en production : ne pas le faire sans
décision de Hugo, prise sur le cas précis.

**Lettres mortes laissées en place, décision de Hugo (2026-10-24)** :
l'abonné `accounting.record-delivery-day.on-handover` est retiré par le même
lot. Ses livraisons encore en attente, et celles créées par l'ancienne image
entre `migrate deploy` et la bascule, finissent en lettres mortes (« n'est
plus inscrit »). Elles ne portent rien de perdu : la remise pose déjà la date.
Elles restent visibles dans `GET /admin/outbox/dead-letters` ; ne pas les
rejouer, le rejeu échoue de la même façon.

## Remettre la production à blanc — délibérément SANS outil

Fait une fois, le **2026-08-16**, pour vider les données de test avant
l'ouverture commerciale. Un script dédié avait été écrit puis **supprimé le jour
même** : une commande qui vide la production en une ligne est un danger
permanent pour un gain d'une fois par an. Son histoire reste dans git
(prisma/wipe-business-data.ts, commits du 16/08, retiré par `c6de2e91`) si le
besoin revient.

Ce qu'il faut savoir si le cas se représente, et qui a coûté du temps :

- **Une URL `prisma+postgres://` est une passerelle HTTP (Accelerate)** ;
  l'adaptateur `pg` ne sait pas lui parler. Depuis le 2026-09-22, `AppConfig`
  la refuse au démarrage (cf. [`base-de-production.md`](base-de-production.md)).
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

| Ce qu'on voit                                                                           | Cause probable                                                                                                                                                              |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `500 Container suddenly disconnected` juste après un déploiement                        | démarrage à froid — réessayer                                                                                                                                               |
| `502 upstream injoignable` par la passerelle                                            | idem, ou binding absent                                                                                                                                                     |
| `503 backend non relié`                                                                 | service binding non déclaré — erreur de configuration                                                                                                                       |
| CI rouge sur MinIO / Docker Hub                                                         | aléa externe — relancer                                                                                                                                                     |
| Déploiement vert, panne à la 1ʳᵉ requête                                                | connexion Prisma paresseuse : le boot ne teste rien                                                                                                                         |
| Le container ne démarre pas, « DATABASE_LFD_URL ne pointe pas vers un Postgres direct » | le secret relayé est une URL Accelerate ou mal formée — cf. [`base-de-production.md`](base-de-production.md)                                                                |
| `persistence.database_unavailable` en rafale, sans panne franche                        | pool `pg` saturé — `P2037` (le pooler refuse), ou 5 s sans connexion libre dans l'instance ; ce que le pooler distant renvoie à saturation n'a pas été éprouvé (2026-09-19) |
| Front qui appelle une vieille URL                                                       | variable changée sans redéploiement                                                                                                                                         |
