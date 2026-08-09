# Plan de release — août 2026

> **Établi le** 2026-08-09 (dimanche). Deux jalons datés :
>
> | Jalon  | Date                 | Ce qu'on livre                                                             |
> | ------ | -------------------- | -------------------------------------------------------------------------- |
> | **J1** | **mercredi 12 août** | La plateforme **client** en test, panier assumé « faux » (catalogue semé). |
> | **J2** | **lundi 17 août**    | La partie **commerciale** : acquisition et **saisie de lead**.             |
>
> Base factuelle : [`b2b/audit-flux-plateforme-admin.md`](b2b/audit-flux-plateforme-admin.md).
> Ce plan **arbitre** ce que l'audit constate ; il ne le répète pas.

---

## Le principe qui gouverne les deux jalons

**On ne montre au client que ce à quoi quelqu'un peut répondre.**

Une fonctionnalité visible dont la suite n'existe pas coûte plus cher que son
absence : elle crée une attente, un e-mail de relance, un client déçu, et une
dette de confiance qu'aucun correctif ne rembourse. Le panier « faux » du 12/08
n'est pas un problème — c'est annoncé et cadré. Un **panier récurrent qui ne se
déclenchera jamais**, si.

D'où, pour chaque jalon, trois listes et non une : ce qu'on **ouvre**, ce qu'on
**coupe**, ce qu'on **doit construire avant**.

---

## J1 — mercredi 12 août · plateforme client en test

**But** : mettre l'app entre les mains de vrais utilisateurs pour observer le
**parcours**, pas pour encaisser. Le catalogue est semé, les commandes sont des
commandes de test.

### Ce qu'on ouvre

- Connexion, compte, entreprise (déclaration, pièces, activation).
- Boutique + panier + commande, avec acheminement (livraison / retrait) et TVA.
- « Mes commandes » — la liste et le détail.
- Prise de rendez-vous et demande de contact.

### Ce qu'on coupe (drapeaux, pas suppression)

| À couper                                      | Pourquoi                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Paniers récurrents**                        | Aucun planificateur : le panier ne produira jamais de commande (audit P0-5). C'est la coupe la plus importante du jalon. |
| **Timeline de statut** dans « Mes commandes » | Quatre étapes sur cinq ne s'allumeront jamais (P0-2). Afficher « Commande passée » + l'état du paiement, rien de plus.   |
| **Paiement réel**                             | Rester en clés de test Stripe. À vérifier explicitement avant le déploiement.                                            |

Le drapeau se pose comme `FEATURE_DASHBOARD` — un point unique dans
`feature-flags.ts` qui masque **la route et l'entrée de menu**, pas seulement le
bouton.

### Ce qu'il faut construire avant (par ordre de valeur)

1. **Une liste des commandes côté admin** — `GET /admin/orders` + un écran de
   liste avec le détail. Sans elle, une commande de test n'est observable que par
   requête SQL. C'est ~1 jour et ça transforme le test en observation.
   _Si le temps manque, c'est le seul de la liste qui ne peut pas sauter._
2. **Le drapeau « paniers récurrents »** — une heure.
3. **La bannière « environnement de test »** dans l'app — que personne ne prenne
   une commande de test pour une commande.

### Critères de sortie

- Un parcours complet inscription → entreprise → commande passe en préproduction,
  fait par quelqu'un d'autre que son auteur.
- Cette commande est **visible dans le back-office** sans SQL.
- Aucune entrée de menu ne mène à un écran sans suite.
- `tsc`, lint et tests verts sur les trois apps **avant** la fusion vers `main`
  (aujourd'hui, rien ne le vérifie — cf. P0-6 et « Mécanique » plus bas).

---

## J2 — lundi 17 août · commercial, acquisition et saisie de lead

**But** : que l'équipe commerciale travaille dans l'outil — saisir un prospect,
le faire avancer, poser un rendez-vous, et voir arriver ce que la plateforme
produit.

### Ce qu'on ouvre

- **Prospects** : saisie d'un lead, pipeline, actions par ligne.
- **Calendrier** et **page rendez-vous**, avec la fiche client commerciale et
  l'historique d'interaction.
- **Comptes clients** : fiche société, pièces, activation, mutations d'état.
- **Réglages → Commercial** : disponibilités, politique, fermetures.

### Ce qu'on coupe

| À couper                    | Pourquoi                  |
| --------------------------- | ------------------------- |
| Rien du périmètre ci-dessus | Il est complet et bouclé. |

Le **cockpit** et **croissance** peuvent rester ouverts : ils lisent, ils ne
promettent aucune action. (Leur exactitude est un autre sujet, hors périmètre.)

### Ce qu'il faut construire avant (par ordre de valeur)

1. **La file des demandes de contact** — l'API existe et n'a aucun écran
   (P0-4). Sans elle, tout « Je veux être rappelé » saisi le 12/08 est perdu.
   ~½ journée : une liste, le motif, le message, un bouton « traitée ».
2. **Une notification à l'équipe** — au minimum un e-mail au commercial quand un
   rendez-vous est pris ou une demande déposée (P0-3). C'est ce qui fait la
   différence entre un outil et un formulaire. Un mailer transactionnel + deux
   gabarits ; l'accusé de réception **au client** peut suivre.
3. **Le mur staff** (P1-3) — le jour où le login staff passe en production,
   n'importe quel jeton staff peut résilier une société. Deux options :
   - **a)** appliquer `StaffScope` dans un guard (`@RequireScope('commercial')`) ;
   - **b)** décider que tout le staff est de confiance en V1, et **le noter**.
     La b) est acceptable pour une équipe de trois personnes ; la a) coûte ~½ jour.
     Ce qui n'est pas acceptable, c'est de ne pas trancher.
4. **Vérifier le sujet d'un rendez-vous posé par le staff** (P1-4) — ~2 h, évite
   les rendez-vous orphelins dès le premier jour d'usage réel.
5. **L'audience staff Auth0 en production** — prérequis de déploiement, pas de
   développement. À confirmer tôt : c'est le genre de point qui bloque un lundi
   matin.

### Critères de sortie

- Un commercial saisit un lead, le fait avancer, lui pose un rendez-vous, et
  retrouve le tout dans la fiche — sans aide.
- Une demande de rappel déposée par un client apparaît dans une file **et**
  déclenche une notification.
- Aucune route `/admin/*` n'est accessible sans jeton staff (test de non-régression).

---

## Après les jalons — l'ordre qui suit

Ni l'un ni l'autre jalon ne referme les trois grosses boucles. Dans l'ordre où
elles font mal :

1. **Le cycle de vie de la commande** (P0-2) — trancher l'énuméré, puis écrire
   les transitions et l'écran staff qui les déclenche. Sans ça, il n'y a pas de
   production.
2. **Le planificateur de paniers récurrents** (P0-5) — c'est la promesse la plus
   forte du produit, et elle est vide.
3. **Le catalogue depuis le PIM** (P1-1) — tant que deux seeds jumeaux se
   répondent à la main, chaque changement de prix est une double saisie.
4. **Une seule fiche client** (P1-2), puis les périmètres staff si l'option b)
   a été retenue.

---

## Mécanique de release (les deux jalons)

- **Les workflows se déclenchent sur `main`**, le travail vit sur `dev` : chaque
  jalon passe par une fusion `dev → main`. À faire la **veille**, pas le matin.
- **La CI existe depuis le 2026-08-09** : `.github/workflows/ci.yml` garde les
  Pull Requests, `main` et `dev` — lint, typecheck, tests (dont les e2e du
  backend sur un vrai Postgres) et build AOT des deux fronts B2B. Mettre
  **`ci-gate`** en statut requis sur `main` dans les réglages du dépôt : sans
  ça, la CI informe mais n'empêche rien. Ce qu'elle ne couvre volontairement pas
  est écrit dans [`todos/todo-qualite-tests.md`](todos/todo-qualite-tests.md).
- Les migrations Prisma s'appliquent sur la base de production **avant** la
  bascule de l'image.
- Prévoir le retour arrière : la version précédente reste déployable, et on sait
  la remettre sans migration inverse (aucune migration destructive n'est prévue
  sur ces deux jalons — le vérifier avant de fusionner).
