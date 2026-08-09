# Audit — les flux plateforme → admin

> **Date** : 2026-08-09. **Méthode** : lecture du code, pas des docs. Chaque
> constat porte sa preuve (fichier, ou absence de fichier). **Périmètre** : la
> logique générale et les flux entre l'app client et le back-office. Les
> indicateurs et la dataviz sont volontairement **hors périmètre**.
>
> Ce que cet audit cherche : les endroits où **le client fait quelque chose et où
> personne, côté LFC, ne peut y répondre**. Pas les imperfections — les boucles
> ouvertes.

---

## Le constat en une phrase

La plateforme client sait **produire** des faits — une commande, un panier
récurrent, un rendez-vous, une demande de rappel. Le back-office sait
**analyser** ces faits (cockpit, croissance, fiche client). Entre les deux, il
manque presque partout la surface qui permet d'**agir dessus**.

```
Client                     Backend                    Back-office
──────                     ───────                    ───────────
commande            →      Order (placed)      →      ✗ aucune surface
panier récurrent    →      Subscription        →      ✗ rien ne le déclenche
rendez-vous         →      Appointment         →      ✅ Calendrier + fiche
« rappelez-moi »    →      SupportRequest      →      ✗ API sans écran
(tout)              →      (aucun mailer)      →      ✗ personne n'est prévenu
```

Une seule des quatre boucles se referme : le rendez-vous. C'est celle qu'on
vient de construire.

---

## P0 — les boucles ouvertes

### P0-1 · La commande n'a **aucune** surface admin

**Preuve** : les contrôleurs montés sont `admin/activations`, `admin/cockpit`,
`admin/commercial/market`, `admin/companies`, `admin/delivery-zones`,
`admin/growth`, `admin/leads`, `admin/pickup-addresses`,
`admin/platform-settings`, `admin/prospects`, `admin/recompute`,
`admin/staff-users`, `admin/support-requests`, `admin` (rendez-vous). **Il n'y a
pas d'`admin/orders`.**

Le back-office ne peut ni lister les commandes, ni en ouvrir une, ni la faire
avancer, ni l'annuler. Les commandes n'existent côté staff que comme **agrégats**
dans la fiche client (`recentOrders`, chiffre d'affaires) — de la lecture
statistique, pas un outil de travail.

**Conséquence directe** : le 12/08, un client commande et **personne à LFC ne
voit la commande** ailleurs que dans un total.

### P0-2 · Le cycle de vie de la commande est déclaré mais **mort**

`OrderStatus` compte six valeurs (`draft`, `placed`, `confirmed`,
`in_production`, `fulfilled`, `cancelled`). Une recherche sur `in_production` et
`fulfilled` dans `src/orders/` ne rend **aucune écriture** — hors tests. Les
seules transitions réelles sont `place-order` (→ `placed`) et
`confirm-order-payment` (le `paymentStatus`).

Deux effets :

- la timeline « paiement → livrée » de l'espace client montre un parcours dont
  **quatre étapes sur cinq ne s'allumeront jamais** ;
- `REVENUE_STATUSES` (fiche client) somme quatre statuts dont trois sont
  inatteignables — juste, mais pour une mauvaise raison.

**Arbitrage à rendre** : soit on assume `placed` + paiement pour la V1 et on
**réduit l'énuméré** (un statut qu'on n'écrit pas est un mensonge de schéma),
soit on écrit les transitions. Le pire choix est de laisser en l'état.

### P0-3 · Aucune notification, nulle part

**Preuve** : aucune occurrence de `nodemailer`, `sendMail`, `MailerService`,
`resend` ou `sendgrid` dans le backend.

Donc : le client qui réserve un rendez-vous ne reçoit **rien** ; le commercial
n'est **pas prévenu** ; la demande de rappel n'alerte **personne** ; la commande
n'est confirmée par **aucun e-mail**. Tout repose sur quelqu'un qui pense à
ouvrir le back-office.

C'est le lot **R6** de la doc rendez-vous, jamais fait. C'est aussi le **seul**
point de cet audit qui rend une fonctionnalité livrée franchement dangereuse :
un rendez-vous pris et oublié coûte le prospect.

### P0-4 · La demande de contact a une API et **aucun écran**

`GET /admin/support-requests` et `POST /admin/support-requests/:id/handle`
existent (`account/http/admin-support.controller.ts`). Une recherche de
`support-requests` dans les deux fronts ne rend **rien**.

Un « Je veux être rappelé » — le chemin qu'on vient d'ouvrir aux prospects sans
entreprise — tombe dans un trou. Le motif qu'on demande au client n'est affiché
nulle part.

### P0-5 · Le panier récurrent ne déclenche **rien**

**Preuve** : aucun `@Cron`, aucun `ScheduleModule`, aucun BullMQ dans le backend.

Un client crée un panier hebdomadaire ; aucune commande n'en naîtra jamais. Le
gabarit, les échéances et les overrides sont modélisés et éditables — la
**planification** n'existe pas. C'est la fonctionnalité la plus visible de
l'espace client, et c'est une coquille.

### P0-6 · Aucune CI : ni lint, ni tests, avant un déploiement

`.github/workflows/` ne contient que des workflows de **déploiement**. Le plus
complet (`deploy_b2b_backend.yml`) fait `tsc --noEmit`, puis construit et pousse
l'image. **Aucun `lint`, aucun `test`, sur aucune app**, et rien du tout sur les
Pull Requests.

Preuve que ça mord déjà : les tests de `packages/contracts` étaient **rouges sur
`dev`** (3 specs de `support` restées muettes après que le motif est devenu
obligatoire) sans que rien ne le signale — aucune commande d'app ne les exécute.
Réparé le 2026-08-09 ; la cause, elle, ne l'est pas.

---

## P1 — les manques structurels

### P1-1 · Le catalogue est semé **en dur, deux fois**

`apps/lfc-B2B-platform-frontend/src/app/data/catalogue-seed.ts` (1 079 lignes) et
`apps/lfc-B2B-platform-backend/src/orders/infrastructure/product-catalog.seed.ts`
décrivent le même catalogue, à la main, et doivent s'accorder **par SKU** —
sinon le checkout refuse un produit que la boutique affiche.

Le commentaire du seed backend l'assume (« jetable, remplacé par la vraie synchro
catalogue PIM »). C'est le « panier fake » du 12/08, et c'est un choix
raisonnable pour un test. La **dette** n'est pas le seed : c'est qu'il n'existe
aucun port d'alimentation depuis le PIM, qui possède pourtant le catalogue. Tant
qu'il n'existe pas, chaque changement de prix est une double saisie, dans deux
apps, sans filet.

### P1-2 · Deux fiches client concurrentes

Il y en a **deux**, avec deux endpoints et deux modèles de vue :

- `/comptes-clients/:id` → `fiche-client/` — l'angle **activation** (pièces,
  identité, règlement), sur `GET /admin/companies/:id` ;
- la fiche **commerciale** de la page rendez-vous → `commercial/calendrier/customer-sheet/`,
  sur `GET /admin/companies/:id/customer-sheet`.

Le staff n'a donc pas « la fiche d'un client » mais deux demi-fiches selon la
porte par laquelle il est entré. À terme il faut **une** page, avec des sections.
La question à trancher d'abord : est-ce que « activation » et « commercial » sont
deux métiers ou deux moments ?

### P1-3 · Les périmètres staff sont modélisés et jamais appliqués

`StaffScope` (`commercial` / `comptabilite` / `admin`) existe en base ;
`StaffPrincipal.scopes` est lu depuis le jeton. **Aucun guard, aucun décorateur
ne les vérifie** : tout porteur d'un jeton staff peut tout faire — y compris
`PATCH /admin/companies/:id/status` (suspendre, **résilier**).

Le schéma le dit honnêtement (« l'enforcement viendra quand le login staff sera
branché sur Auth0 »). Reste que c'est exactement le jour où on branche le login
qu'il faut que ce soit fait, pas le lendemain.

### P1-4 · Le staff peut poser un rendez-vous sur un sujet **inexistant**

`schedule-appointment.handler.ts` prend `subjectType` / `subjectId` du payload et
ne vérifie **jamais** que la société, le lead ou l'utilisateur existe. Le chemin
client, lui, vérifie l'appartenance (`resolveSubject`, mur de tenancy).

Une faute de frappe crée un rendez-vous orphelin qui s'affichera dans le
Calendrier sans nom, et dont la page ne pourra charger aucune fiche. Correctif :
un port de résolution du sujet, appelé avant `Appointment.schedule`.

### P1-5 · Le lead n'a **aucune porte d'entrée** depuis la plateforme

`CaptureLeadCommand` n'est appelé que par `POST /admin/leads` — de la **saisie
staff**. Les deux chemins ouverts au public (rendez-vous, demande de support)
exigent un compte authentifié.

Pour la release du 17/08 (« acquisition, saisie de lead »), c'est **cohérent** :
le commercial saisit. Mais il faut l'énoncer, parce que la conséquence est
qu'aucun formulaire public ne nourrit le pipeline, et qu'un visiteur non connecté
ne laisse aucune trace.

### P1-6 · Le journal est best-effort, et l'historique commercial en dépend

`PrismaActivityRecorder` avale toute panne d'écriture (par contrat, pour ne pas
casser la transaction métier) — décision saine à l'origine. Depuis, l'**historique
d'interaction commerciale** de la fiche client se lit **entièrement** dans ce
journal. Un événement perdu n'est donc plus une statistique en moins : c'est un
rendez-vous qui disparaît de l'historique d'un client.

À arbitrer : garder le best-effort pour les faits analytiques, mais rendre
**transactionnelles** les quelques lignes qui portent une lecture métier
(`appointment.*`, `order.placed`).

---

## P2 — hygiène

- **13 fichiers dépassent la limite de 300 lignes** (règle CLAUDE.md §6). Les
  plus gros sont hors périmètre commercial (`catalogue-seed.ts` 1 079,
  `growth-charts.ts` 1 077, `croissance-page.html` 632) ; dans le périmètre :
  `activation-support-panel.ts` (344), `fiche-client-page.ts` (305),
  `company.ts` (325), `appointment.ts` (352).
- **Aucune redirection** depuis l'ancienne URL `/commercial/calendrier/:id` vers
  `/rendez-vous/:id` — un lien partagé avant le 09/08 tombe en 404.
- Le **budget de bundle** du front admin est dépassé (~920 kB), antérieur au
  travail de cette semaine.

---

## Ce que cet audit ne dit pas

Il ne juge **pas** les indicateurs (cockpit, croissance, scoring, Lorenz,
market) : hors périmètre demandé. Il ne cherche pas non plus les micro-défauts de
composant — seulement les endroits où un flux ne se referme pas.

Suite opérationnelle : [`../release-plan-2026-08.md`](../release-plan-2026-08.md).
