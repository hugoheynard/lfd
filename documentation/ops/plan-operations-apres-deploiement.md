# Plan — les opérations après déploiement, un bouton plutôt qu'une commande

> 📝 **Plan du 2026-11-01**, demande de Hugo (option b : le prochain
> déploiement part avec). Touche une **frontière de sécurité** (qui écrit en
> production), une **reprise de données** et le **runbook** : `vitruve` avant
> le bâti.

## 1. Pourquoi (Hugo, 2026-11-01)

> « Tu pouvais pas me faire un bouton quelque part pour le lancer ? Dans ops,
> on devrait avoir les opérations post-déploiement pour ce genre de cas. »

Aujourd'hui une reprise est un script (`apps/lfd-api/prisma/backfill-*.ts`)
que Hugo lance depuis son poste : à blanc, puis `--write --production <nom>`
retapé, avec l'URL de production dans son environnement. C'est le geste qu'on
oublie (la migration `20261101090000_la_mercuriale_decide` retire en silence
les promotions des tarifs négociés tant que sa reprise n'a pas tourné) et
celui qu'on rate sous pression.

## 2. L'existant (ouvert le 2026-11-01)

- Deux reprises en attente pour le prochain déploiement, déjà découpées en
  « décider » / « écrire » :
  - `PrismaPromotionPolicyBackfill` (`b2b/pricing/infrastructure/prisma-promotion-policy-backfill.ts`) :
    `plan()` rend les décisions, `apply(decision)` écrit une décision dans sa
    transaction et rend `false` si la ligne a bougé ;
  - `PrismaOrderDiscountTermsBackfill` (`b2b/orders/infrastructure/prisma-order-discount-terms-backfill.ts`) :
    `pendingDiscountIds()` puis `fill(id, write)`.
  - Les deux sont rejouables : une ligne déjà reprise n'est plus candidate.
- `ops` n'importe aucun bloc métier et personne ne l'importe (`CLAUDE.md`, § 3).
  Le précédent d'un mécanisme technique montré par ops est l'**outbox** :
  vit dans `platform/outbox/`, routes `admin-outbox*.controller.ts` sous la
  surface `ops_health`.

## 3. La forme

1. **Un contrat dans `platform/`** (seul endroit que `b2b` et `ops` lisent
   tous deux) : `PostDeployOperation`, classe abstraite —
   `key` (stable, sert d'identifiant), `title`, `why` (texte pour l'écran),
   `simulate(): Promise<OperationReport>` (lecture seule : compte et
   échantillon lisible) et `apply(): Promise<OperationReport>`. Un
   `OperationReport` porte des **comptes et des phrases**, jamais une donnée
   personnelle.
2. **Chaque contexte déclare la sienne** en enveloppant sa reprise
   existante : `pricing` pour les mercuriales, `orders` pour les termes figés.
   Les fichiers `prisma/backfill-*.ts` gardent leur logique ; le script en
   ligne de commande reste (base locale, secours).
3. **`appBootstrap` les relie** en une liste injectée (jeton multi-fournisseur),
   comme les autres ports de `platform`.
4. **`ops` montre et déclenche** : `GET /admin/ops/post-deploy` (liste, état),
   `POST …/:key/simulate`, `POST …/:key/apply`. Une opération est **à faire**
   tant que sa simulation trouve quelque chose ; à zéro elle s'affiche
   « rien à faire » — c'est la disparition « d'elle-même », sans liste tenue
   à la main. Le code d'une opération se retire ensuite par un commit.
5. **La trace** : chaque simulation et chaque application est écrite dans
   une table du schéma `ops` (`post_deploy_runs` : clé, geste, rapport,
   auteur staff, instant, révision de l'image). Seul `ops` l'écrit et la lit.
6. **« Appliquer » n'existe qu'après une simulation** du même auteur, de moins
   de 15 minutes, sur la même révision d'image : le serveur le refuse
   sinon (409, message qui dit « simulez d'abord »). Deux applications en
   même temps : la seconde est refusée (verrou consultatif Postgres sur la
   clé).
7. **Permission** : une ressource neuve `ops_post_deploy` (lecture =
   voir et simuler, écriture = appliquer). La migration ajoute la valeur à
   `StaffResource` ; le droit s'accorde **à l'écran** (`/admin/staff-roles`),
   jamais par migration (`lint:no-role-grants-in-migrations`).
8. **Écran back-office** : une page sous la carte de santé, une carte par
   opération — titre, pourquoi, état, dernier rapport, « Simuler » puis
   « Appliquer » (fold-ng). Une application se lance en tâche et l'écran
   relit son état : une reprise longue ne tient pas une requête HTTP
   ouverte.

## 4. Ce que ça change au runbook

`documentation/ops/runbook.md` : après un déploiement vert, ouvrir « Après
déploiement », simuler chaque opération à faire, lire le compte, appliquer.
Plus d'URL de production sur le poste pour une reprise.

## 5. Les tests

- Unitaires : le refus d'« Appliquer » sans simulation récente, de même
  auteur et même révision ; l'état « rien à faire ».
- Les deux opérations : simulation sans écriture, application rejouable
  (une deuxième application ne change rien).
- e2e : la liste, les deux gestes, la permission (sans droit → 403), la
  trace écrite.

## 6. Questions ouvertes (pour vitruve puis Hugo)

- Faut-il qu'une opération puisse **dépendre** d'une autre (ordre
  mercuriales → termes figés) ? Proposition : un ordre d'affichage seulement,
  les deux étant indépendantes.
- Le délai de 15 minutes et la règle « même auteur ».

## 7. Après vitruve (2026-11-01) — fait foi sur les §§ 2–6

1. **La reprise des remises a trois passes**, pas une :
   `prisma/backfill-order-discounts.ts` enchaîne les remises manquantes
   (`PrismaOrderDiscountBackfill.recover`, lot M2), les remises périmées
   (`--refresh-drifted`, M3), puis les termes figés. L'opération « remises des
   commandes » les enveloppe **toutes les trois, dans cet ordre** ; l'état de
   M2/M3 en production n'est pas connu, la simulation le dira. Les deux
   opérations ne sont **pas** indépendantes : « politiques des mercuriales »
   d'abord, « remises des commandes » ensuite, et la seconde ne s'applique
   pas tant que la première est à faire.
2. **« À faire » = il reste une décision écrivable** (`set` côté
   mercuriales, `backfilled` possible côté termes, une remise à recréer).
   Les cas que la reprise ne sait pas trancher (`none`, `undecided`) sont
   listés « à trancher à la main » et ne tiennent pas l'opération ouverte.
3. **Une machine d'états** dans `ops.post_deploy_runs` : `simulated` →
   `running` → `succeeded` | `failed` | `interrupted`. L'application avance
   **par lots**, chaque lot dans sa transaction, l'avancement écrit après
   chaque lot. Au démarrage, une image passe à `interrupted` toute ligne
   `running` d'une autre révision. Relancer est permis (chaque ligne est
   idempotente) après une nouvelle simulation sur la révision courante.
4. **Pas de verrou consultatif** (le pooler change de connexion) : l'unicité
   d'une application en cours est un **index unique partiel**
   `(operation_key) WHERE state = 'running'`.
5. **L'auteur est le staff qui clique.** L'opération reçoit l'acteur ; le
   fait tarifaire (`pricingEvent`) le nomme à la place de
   `system:reprise-politique-promotions`. La mise à jour d'un brouillon de
   mercuriale entre dans la transaction de la décision.
6. **Le temps de chaque lot** est celui du lot : la tâche sort du contexte
   de la requête (un `now` par lot), au lieu de figer l'instant du clic.
7. **Le câblage passe par les bus.** Le contrôleur d'`ops` n'injecte que
   `CommandBus`/`QueryBus` (`SimulatePostDeployOperation`,
   `ApplyPostDeployOperation`, `ListPostDeployOperations`) ; chaque contexte
   fournit son implémentation construite sur `PrismaService`, `IdGenerator`
   et `Clock` ; `appBootstrap` relie la liste. Les scripts en ligne de
   commande restent pour la base locale.
8. **Simuler demande la lecture** : `@RequirePermission` en lecture sur
   `…/simulate` (`AdminSurface` déduirait l'écriture d'un `POST`).
9. **Le premier jour** : le droit `ops_post_deploy` s'accorde à l'écran
   avant le déploiement qui en a besoin. Le runbook porte ce geste.
   `StaffResource` vit dans `@lfd/contracts` : suite racine au bâti.
10. **L'irréversible se dit** : l'écran montre l'échantillon et la limite
    (« termes déduits de la promotion d'aujourd'hui, sans retour arrière ;
    sauvegarde de la base avant ») ; « Appliquer » demande de cocher
    « j'ai lu ».
11. **La fenêtre n'est pas fermée par le bouton** : tant qu'une opération est
    à faire, un **bandeau** en tête du back-office le dit à qui a le droit.
12. Correction du § 2 : l'outbox vit dans `platform/`, montrée sous
    `ops_health` — `ops` n'a encore jamais déclenché d'écriture ; ce sera la
    première. Une opération terminée en production se retire au lot suivant,
    noté dans ce plan. `backfill-naf.ts` est hors périmètre.
