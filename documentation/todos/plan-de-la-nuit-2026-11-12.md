# Plan de la nuit du 2026-11-12

> 📋 **Feuille de route, 2026-11-12 au soir.** Demande de Hugo : « une doc plan
> de la nuit où on voit tous les points que tu vas attaquer ». Chaque point se
> raye ici (date + commit) quand il est fait. Rien ne part sur `main` sans
> « pousse main ».

## Règles de la nuit

- Un lot à la fois, dans l'ordre ci-dessous ; un point bloqué s'écrit ici avec
  sa raison, et on passe au suivant.
- Sur `dev` seulement. Le matin : point avec Hugo, puis production sur son
  ordre.
- Migrations : lues par le `lecteur-de-migrations` avant tout commit.
- Pas de suite générale lancée par un agent ; la CI de `dev` fait foi.

## 1. Déjà fait ce soir

- [x] Préchargement du bandeau du jour dans le panier de la boutique
      (`9482f4023`, sur `dev`).

## 2. Corriger

1. ✅ (`91f6856c2`, à prouver en production) **🔴 Les appels vers l'objet des journées arrivent à l'objet des rayons.**
   Constaté le 2026-11-12 à 22 h 17 dans l'onglet Cache : les deux objets
   rendent EXACTEMENT les mêmes compteurs, sous le nom `pro-shelves`.
   - **Ce qui est prouvé** : l'effet. Le nom `pro-shelves` n'est écrit que par
     `ProShelves` ; `DayVersions` compte sous `day-versions` et les noms des
     contenus. Les deux lectures sont donc servies par `ProShelves`. Côté
     `ProShelves`, `/scopes/…` et `/contents/…` ne se lisent pas
     (`parseShelfCall` → `null`) : **400**, rien n'est rangé ni effacé. L'API
     prend un 400 pour une réponse illisible
     (`UnreadableDayVersionsReplyError`) et relit la base : numéros des
     journées et des sujets, contenus du catalogue du back-office et du PIM
     n'ont **jamais** été gardés en production — chaque lecture est allée en
     base, avec un avertissement journalisé. Rien de faux n'a été servi ;
     `ProShelves` a seulement compté ces appels dans ses « requêtes ».
   - **Ce qui n'est PAS prouvé** : le mécanisme. Ni l'API (deux adresses),
     ni le Worker (deux gestionnaires), ni `@cloudflare/containers` 0.3.7
     (`ContainerProxy.fetch` choisit par `url.hostname`, un même
     `ContainerProxy` pour les deux hôtes) n'expliquent le mélange. Essai
     local `wrangler dev` 4.157 + Docker le 2026-11-12, deux hôtes interceptés
     comme en production : 60 paires d'appels concurrents, **zéro** erreur
     d'aiguillage. La doc Cloudflare dit qu'un hôte intercepté résout vers
     une « adresse de substitution » et que l'URL vient de l'en-tête `Host`
     pour l'HTTPS, sans le dire pour l'HTTP : l'hypothèse reste que le
     runtime de production aiguille par l'adresse, commune aux deux hôtes, et
     reconstruit l'URL avec le premier.
   - **Correction (non commitée, non déployée)** : un seul hôte intercepté,
     `objets.interne`, et l'objet choisi par le préfixe du chemin
     (`apps/lfd-api/container/internal-objects.ts` : `/rayons/…` → `ProShelves`,
     `/journees/…` → `DayVersions`, préfixe retiré, 404 sinon). Refus 403 et
     relais de la purge publique gardés. Les adresses posées par le Worker
     deviennent `http://objets.interne/rayons` et
     `http://objets.interne/journees` ; l'API n'a pas changé (ses adaptateurs
     concatènent déjà le chemin à l'adresse). Les anciens hôtes restent
     interceptés et aiguillés par l'hôte un déploiement, pour un conteneur
     démarré avant la bascule ; à retirer au suivant.
   - **Test** : `apps/lfd-api/container/__tests__/internal-objects.spec.ts` fait passer
     les VRAIS adaptateurs de l'API par l'aiguillage du Worker et vérifie que
     chaque objet reçoit un chemin qu'il comprend. Il ne remplace pas
     l'épreuve en production : après le déploiement, l'onglet Cache doit
     montrer `day-versions` d'un côté et `pro-shelves` de l'autre.

## 3. Construire

2. ✅ (`61ce2cbdb`) **Purge de la table des gestes (`gesture_intent`)** — **7 jours**
   (décidé par Hugo le 2026-11-12). Élagueur sur la passe nocturne
   qui purge les journaux, comme `day_change` ; une clé rejouée après la purge
   referait le geste, d'où une durée qui couvre largement les renvois réels
   (réseau, onglet rouvert, coursier hors ligne) et Stripe (24 h).
3. ✅ (`6e87d7cc5`, mode rapport par défaut) **Vérification de dérive avant migration** dans
   `deploy_lfd_api.yml` : comparer la base de production aux migrations
   appliquées (`prisma migrate diff`, lecture seule) avant `migrate deploy` ;
   arrêter le déploiement sur un écart non inscrit ; la liste des écarts
   connus, avec leur raison, dans un fichier du dépôt. Le premier passage
   montrera les écarts anciens : ils sont listés, pas corrigés cette nuit.

2 bis. **Finir l'idempotence** (Hugo, 2026-11-12 : « l'intégralité ») —
lots J3, J4, J5 (repères dans `ops/l-idempotence-des-ecritures.md`, § 7) :

- **J3** : un e2e de rejeu généré depuis l'inventaire de la porte, qui
  envoie deux fois chaque route « par intention » avec la même clé et
  vérifie une seule écriture et deux réponses identiques ;
- **J4** : la porte refuse `@Idempotent` sur un `POST` dont le handler crée
  (`ids.next()`), envoie un e-mail ou appelle le réseau ;
- **J5** : côté écrans (back-office et boutique), tout appel vers une route
  « par intention » passe par `GestureIntents`, jamais une clé tirée au clic.
  Puis le plan devient une **doc d'état** de l'idempotence.
  2 ter. **Audit du système de garantie de l'idempotence**, rendu au rapport du
  matin (§ 7) : ce que la porte, le scellement, les tests et les écrans
  garantissent réellement, ce qui échappe (écritures hors HTTP, effets chez
  un tiers, deux clics simultanés sur un geste « par nature », risques
  assumés), chaque affirmation vérifiée dans le code.

2 quater. ✅ (`c137414e2`) **Refus d'écrire sur une fiche client périmée** (Hugo, 2026-11-12) :
une modification envoyée sur une fiche que quelqu'un a changée depuis sa
lecture est refusée (409 nommé : « cette fiche a changé depuis que vous
l'avez ouverte ») au lieu d'écraser. Court plan d'abord (où vit la version
de la société, quels gestes de la fiche la portent), vérifié dans le code.
2 quinquies. **Finir le paiement par virement** (Hugo, 2026-11-12) : T4
(l'écran) et T5 (la boutique) du plan
`comptabilite/le-paiement-par-virement.md`, plus les trois
petites décisions (écart avant de valider, déduction d'un avoir, état dans
la vue facture) tranchées et écrites dans le plan. L'argent : `vitruve` sur
ce qui n'a pas encore été contredit. Rappel : l'IBAN ne part jamais par
e-mail.

## 4. Documenter

4. ✅ (2026-11-12, non commité) **Les plans finis deviennent des docs d'état**,
   les plans sont retirés et leurs liens repointés : les cinq plans du cache
   (veilleur unique, écran Catalogue, lectures du PIM, onglet Cache, objet
   des journées) → `caching-usage/le-cache-du-back-office.md` (le lot 2 des
   journées y reste à faire) ; le plan du virement →
   `comptabilite/le-paiement-par-virement.md` (le moyen figé dans la vue
   d'une facture y reste à faire). Le plan de l'idempotence est devenu
   `ops/l-idempotence-des-ecritures.md` (doc d'état, après `97d638522`).
5. ✅ (2026-11-12, non commité) **La carte des chantiers** : ce qui est fait,
   ce qui reste, dans l'ordre.
6. ✅ (2026-11-12, non commité) **Les 🟦 « sur dev » passés à ✅** pour ce
   qui est en production (`adb9c41e3`).
7. ✅ (2026-11-12, non commité) **Le runbook** : l'incident
   `nutrition_declaration` (42P01), le geste `rolled_back_at` en console
   Prisma, et la vérification des tables avant une migration qui pose des
   déclencheurs.
8. ✅ (2026-11-12, non commité) **`documentation/README.md`** : l'index des
   docs créées ou retirées aujourd'hui.

## 5. Si le temps le permet

9. **Mesure avant/après** des requêtes de l'écran Catalogue et de la liste du
   PIM, en local sur la base de dev (journal des requêtes Prisma), écrite dans
   les docs d'état.
10. **Test de la saisie dans un panneau** de la fiche client pendant une
    relecture du veilleur : un test d'écran qui le prouve.

## 6. À trancher avec Hugo (pas cette nuit)

- Lot 2 des journées (demain matin).
- Audit de sécurité : capture de la fiche racine, fuite d'une facture d'un
  site frère, `RECOMPUTE_TOKEN`, en-têtes des fronts, propriétaire des
  abonnements push.
- Protections de coût : alertes de budget, limites de débit Cloudflare,
  Turnstile.
- Refus d'écrire sur une fiche client périmée.

## 7. Le rapport du matin

### À vérifier en premier, après le prochain déploiement

1. **Onglet Cache** : deux lignes distinctes, `day-versions` et `pro-shelves`,
   avec des chiffres différents. Sinon, la correction de l'aiguillage
   (`91f6856c2`) n'a pas pris, et le cache partagé des journées, du catalogue
   et du PIM ne sert toujours pas (rien de faux n'est servi : tout va en base).
2. **Une fiche client** : ouvrir la même fiche dans deux onglets, enregistrer
   l'identité dans l'un, puis dans l'autre → « Cette fiche a changé… ».
3. **La vérification de dérive** (étape du déploiement de l'API, mode rapport)
   : lire les écarts qu'elle liste au premier passage, et les inscrire ou les
   corriger avant de la rendre bloquante (runbook).

### Fait cette nuit

- Préchargement du panier — `9482f4023`.
- Purge des gestes à 7 jours, index sur la date — `61ce2cbdb`.
- Vérification de dérive avant migration, mode rapport, sans bloquer si
  l'étape tombe en panne — `6e87d7cc5`.
- Aiguillage des objets partagés : un seul hôte, l'objet choisi par le
  chemin. La cause exacte n'est pas prouvée (non reproduite en local) ;
  l'effet l'est : tout allait en base depuis la mise en production du
  cache des journées — `91f6856c2`.
- Idempotence J3 : chaque route à clé rejouée, 80 sur 93 dont tout
  l'argent, aucun double effet trouvé — `95574a15d`.
- Fiche client périmée : révision par société, `If-Match`, 409 nommé,
  rejeu sans refus. Choix fait : seule l'écriture d'un geste décidé sur une
  fiche lue est conditionnée, pour ne pas casser la règle « deux gestes sur
  des colonnes différentes gardent chacun le leur » — `c137414e2`.

- Fiche client périmée — `c137414e2` (avec un `lock_timeout` de 5 s ajouté
  à sa migration).
- Idempotence J4 (porte resserrée, 62 exceptions datées et justifiées) —
  `0c8196adc` ; J5 (porte côté écrans, un vrai défaut trouvé : un gabarit
  tarifaire neuf était toujours refusé) — `a079267d8`.
- Virement T4 (écran « Moyens de paiement ») et T5 (boutique, facture) —
  `d7161d4a0`.

### Audit du système de garantie de l'idempotence (relecteur indépendant, au commit `a079267d8`)

**Verdict** : le registre arrête un doublon séquentiel et deux appels
simultanés **sur la même clé** (index unique `(actor_id, key)`, scellement
dans la transaction de l'écriture, 80 routes sur 93 rejouées par l'e2e). Les
549 routes « par nature » ne tiennent que par une raison déclarée ; J4 ne
contrôle que les `POST`.

**Garanti** : rejeu séquentiel d'une route par intention ; deux requêtes
simultanées avec la même clé (la seconde : 409 « en vol ») ; la clé d'un
autre acteur ne rejoue rien (clé propre à l'acteur) ; la même clé sur un
autre geste ou un autre sujet → 409.

**Échappe, et c'est écrit** : écritures hors HTTP (abonnés, crons) ; effets
chez un tiers (clé du fournisseur, outbox) ; 4 risques assumés en `run`
(société créée, titulaire rattaché, membre invité, lien de mot de passe) ;
13 routes sans scénario de rejeu ; 6 routes que la porte front ne lit pas ;
un rejeu après la purge de 7 jours ; les services injectés que la porte ne
suit pas.

**Failles trouvées (SÉRIEUX), traitées cette nuit (§ suivant)** :

- **F1** — une même clé renvoyée avec un **autre contenu** est rejouée en
  silence dans 57 gestes sur 93 (le sujet n'est qu'un identifiant). Exemple :
  un virement enregistré dont la réponse se perd, montant corrigé et renvoyé :
  l'écran affiche un succès, **le montant corrigé n'est jamais écrit**.
- **F2** — un geste scellé plus long que le bail de 2 min peut s'écrire deux
  fois : la résolution perdante ne touche aucune ligne et n'échoue pas.
- **F3** — des exceptions « transition refusée avant écriture » ne tiennent
  qu'en séquence : pause / reprise / archivage d'une promotion, appliquer /
  ignorer une suggestion de point d'adresse (lecture puis écriture sans verrou).
- **F4** — l'inviter-un-membre-du-staff est rangé « par intention » alors
  qu'il est en `run` (la porte ne suit pas le service qui écrit).

**Mineur** : 62 exceptions et non 61 ; aucun e2e concurrent sur Postgres réel
(« en vol », « mismatch ») ; `mail-check` devrait être un risque assumé
nommé, pas une exception (à trancher) ; la porte des transactions directes
raisonne par fichier.

### Les failles de l'audit, corrigées (`97d638522`)

- **F1** : le sujet d'une intention porte l'empreinte de son contenu (53
  gestes) ; une clé réutilisée sur d'autres valeurs → 409 nommé, l'écran
  repart d'une clé neuve ; la porte l'exige ; e2e sur la vraie base (virement
  reçu, ajout d'un véhicule). Effet admis : une clé enregistrée avant ce
  changement et renvoyée dans les 7 jours est refusée au lieu d'être rejouée.
- **F2** : un scellement perdant annule sa transaction ; une réclamation
  dans une transaction est refusée (la doc du code l'affirmait sans le tenir).
- **F3** : sous verrou — promotions (pause, reprise, archivage, et la
  révision qui remettait une promotion archivée en active), décisions sur un
  point d'adresse, attestations de prélèvement et contrôle des retours, liens
  de paiement (un paiement reçu pendant une annulation pouvait finir
  « annulé »), archivage et mise à jour d'un site.
- **F4** : l'invitation d'un membre du staff devient un risque assumé
  (impossible à sceller : son résultat vient après l'e-mail) ; la porte suit
  les services qui écrivent, et a trouvé le renvoi d'un avis de facture, scellé
  depuis.
- **Doc d'état** : `ops/l-idempotence-des-ecritures.md` remplace le plan
  (`051a814b0`). Docs d'état du cache du back-office et du virement, carte des
  chantiers, ✅ de la production, runbook de l'incident `nutrition_declaration`
  — `97d638522`.
- Virement : aperçu de l'écart par le serveur, « Réglée par virement le … »,
  moyen d'encaissement lu par la boutique — `7fbaa6bad`.

### État au matin

**CI de `dev` verte sur `6158cac4d`** (un lot e2e relancé une fois : image
Docker MinIO non téléchargée chez le registre, pas le code). Tout ce qui est
listé ici est sur `dev` ; rien n'est en production depuis `adb9c41e3`. La
mise en production attend « pousse main ». Elle porte deux migrations
additives relues (`20261112220000` index des intentions, `20261112233000`
révision des fiches, avec `lock_timeout`), et la vérification de dérive
tournera pour la première fois, en mode rapport.

### À trancher avec Hugo

1. **Les 62 exceptions de J4** : l'agent a admis trois familles (clé métier ;
   transition refusée avant écriture, désormais sous verrou ; réseau sans
   effet durable). La lettre stricte du plan en ferait passer ~45 sous clé,
   avec leur écran.
   **Tranché par Hugo le 2026-11-13 : les exceptions sont admises.**
2. **`mail-check`** : il envoie volontairement un nouvel essai à chaque appel ;
   risque assumé nommé, ou clé tirée de la révision ?
   **Tranché par Hugo le 2026-11-13 : risque assumé, inchangé** (un essai de
   plus ne touche que la boîte de l'administrateur ; une clé empêcherait de
   rejouer le contrôle après une correction de configuration).
3. **Le « +1 » du réassort d'un site** : une clé par clic, admise ; garder ?
   **Tranché par Hugo le 2026-11-13 : on garde** (chaque clic compte).
4. **Cinq risques assumés à lien ou e-mail** (société créée, titulaire
   rattaché, membre client invité, membre du staff invité, lien de mot de
   passe) : à fermer par le plan « lien fabriqué à l'envoi ». Vu en route :
   une invitation reprise après le bail pourrait n'envoyer que le premier
   lien, devenu mort — à vérifier côté e-mails.
   **Tranché par Hugo le 2026-11-13 : risque assumé gardé ; on vérifie le cas
   du lien mort, et s'il existe, on ouvre le chantier « lien fabriqué à l'envoi ».**
5. **L'IBAN de l'entité à l'écran du staff** : aujourd'hui réduit à ses 4
   derniers caractères (contrat actuel) ; l'afficher en entier ?
   **Tranché par Hugo le 2026-11-13 : on garde les 4 derniers caractères.**
6. **Décisions de la nuit sur le virement** (écart nul pour valider, avoirs
   non déduits, qui voit le moyen côté client) : à relire, écrites sans
   `vitruve`.
7. **La fiche périmée** : seule l'écriture d'un geste décidé sur une fiche
   lue est conditionnée (pour garder « deux gestes sur des colonnes
   différentes gardent chacun le leur ») ; d'accord ?
   **Validé par Hugo le 2026-11-13.**

### Pas fait cette nuit

- Lot 2 des journées (prévu avec Hugo).
- Mesure avant/après des requêtes ; test de la saisie dans un panneau
  pendant une relecture.
- ~~Couleurs et rôles d'un site réécrits sans verrou~~ — fait le 2026-11-13
  (`loadLocked`, e2e concurrent dans `sites.e2e-spec.ts`, non commité) ; moyen d'encaissement figé dans la vue de la facture.
- `e2e:rebalance` (durées des suites neuves ajoutées à la main).
