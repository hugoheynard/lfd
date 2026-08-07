# Acquisition, Suivi & Reco — TODO technique (aligné concept v3)

> Compagnon de [`espace-commercial-prospects-leads.md`](espace-commercial-prospects-leads.md).
> Cette doc **gèle les décisions d'architecture** issues de la revue adversariale
> tech (Clock, RequestContext, trace/observabilité, modèle d'événements, DDD/agrégats).
> Le socle d'un moteur d'acquisition/reco est un **journal d'événements** + des
> **fondations de contexte de requête** — posés **avant** toute feature growth.

---

## 0. Garde-fous d'architecture (gelés)

1. **State-based domain + event *streaming*.** Le domaine reste **state-based
   (Prisma)** — vérité **transactionnelle**. Le journal est une **projection
   analytique/audit** (event **streaming**), **PAS de l'event sourcing** : on ne
   reconstruit **jamais** l'état métier depuis le journal. Confondre les deux = piège
   mortel.
2. **Le journal N'EST PAS un agrégat** : c'est de l'**infrastructure** append-only
   (comme le mailer). Un seul invariant, l'immuabilité. Vit en `infra/`, pas en `domain/`.
3. **hot / mid = projection, pas agrégat.** Zéro invariant réfutable (dérivé de
   User + Order + events) → read-model. Test de tri (§3.1 CLAUDE) : « une règle
   peut-elle refuser cette écriture ? » → non.
4. **cold + l'état de suivi = agrégat `Lead`.** Là oui : jalon qui ne recule pas,
   « on ne recontacte pas un converti » → invariants → agrégat `load/save`.
   **Ne pas forcer un seul modèle** sur hot/mid et cold.
5. **Le score = fonction pure** (domain service `score(features): number`,
   déterministe, testable sans I/O). La reco `{play, offre, fenêtre}` = pure aussi.
   Les **issues** sont des **événements**. **Pas** de `RecommendationEngine` stateful
   (god-object).
6. **`growth/` est un cross-domain** qui consomme le **contrat d'événements**, jamais
   les tables/agrégats de `orders`/`account`/`subscriptions`. Le journal **est** le
   point de découplage.
7. **Temps.** Le **temps métier** (occurredAt, activatedAt, paidAt) est l'autorité du
   **Clock backend**. Un temps **propagé** (gateway) ne sert **qu'à l'observabilité**
   (latence) — **jamais** à écrire du métier (dérive d'horloges + spoof).
8. **Capture temps réel, calcul en batch.** L'**append au journal est live** (à
   l'événement). Mais les **projections / score / queue** ne sont **PAS temps réel** :
   **recalcul par cron 3×/jour** — **04h00** (atelier, peu de requêtes), **12h00** &
   **20h00** (service des chefs, pas de commandes). Fenêtres creuses choisies exprès.
   Trade-off assumé : la queue est « fraîche au dernier recalcul » (fraîcheur ≤ ~8 h) —
   acceptable, le commercial n'agit pas à la seconde. On pourra passer certaines files
   (rescousse) en event-driven plus tard sans rien casser (capture déjà live).
9. **Home actuel = backend B2B (couplage LOGIQUE assumé).** `growth/` vit **dans** le
   backend B2B — bon choix : les signaux (`order.placed`, `company.declared`,
   `subscription.created`) et la surface staff `/admin/*` y sont déjà (modular monolith,
   pas de microservice prématuré). Le couplage doit rester **logique, jamais structurel** :
   `growth/` dépend **uniquement du contrat d'événements**, **jamais** des tables/agrégats
   de `orders`/`account`/`subscriptions` — le jour où il `import`e un repo voisin, ça
   devient une dette. Le design event-streaming **pré-câble l'extraction** (le journal est
   le point de découplage : extraire = « un service s'abonne au flux + emporte ses
   read-models », un refactor défini d'avance). **3 fils déclencheurs d'extraction** :
   (a) le recompute concurrence le trafic client malgré les heures creuses → analytique
   sur **read replica** / store séparé ; (b) le journal **bloat** la DB transactionnelle
   → schéma/partition séparés puis store dédié ; (c) besoin de signaux **hors B2B** (PIM,
   autres apps suite) → growth devient **cross-suite** → app propre consommant plusieurs
   sources (le trace-id + la gateway servent alors à plein). **Pour que le fil se coupe
   proprement** : `growth/` = contexte dédié ; `activity_event` dans son **propre schéma**
   (déménageable) ; le **recompute = job à part** (déjà Cron-Trigger → endpoint, peut
   devenir son propre worker).

---

## 1. Fondations (à faire **AVANT** toute feature growth) — non-négociable

Cross-cutting, en `infra/` — et **valable pour tous les backends** (candidat à une
règle CLAUDE.md, cf. §3.1 pour les agrégats).

### 1.1 RequestContext via AsyncLocalStorage
Un **middleware d'ingress** pose, une fois par requête, un contexte immuable :
```
RequestContext = { now: Instant, traceId: string, actor: Principal | null }
```
- Implémenté en **AsyncLocalStorage** (raw ALS ou `nestjs-cls`) — **pas** de provider
  Nest `request-scoped` (coût DI par requête).
- **Un seul `now` par requête**, gelé : deux `new Date()` dans un même handler
  dériveraient de quelques ms → événements incohérents. Une requête = **un instant**.

### 1.2 Port `Clock`
```
abstract class Clock { abstract now(): Instant }  // lit le RequestContext (ALS)
```
- Domaine + application dépendent de l'**abstraction** (DIP). **Interdit** `new Date()`
  / `Date.now()` hors de l'adaptateur `Clock` (candidat règle ESLint `no-restricted-*`).
- **`FixedClock`** en test → momentum, cohortes, `activatedAt`, `occurredAt`
  **déterministes**.

### 1.3 Port `IdGenerator` (ULID)
```
abstract class IdGenerator { abstract next(): string }  // ULID
```
- **ULID** : triable par le temps → idéal pour un flux append-only + pagination stable.
- Tue le `Math.random()` / `Date.now()` des numéros de commande & références
  (non-déterministe **et** risque de collision).

### 1.4 Trace context (W3C) + observabilité
- **Standard `traceparent`/`tracestate`** (W3C Trace Context) — **OpenTelemetry-ready**,
  pas un header maison.
- **Gateway** : génère/propage `traceparent` **et** estampe `x-lfc-request-time`
  (instant d'ingress) — **même mécanisme que `x-lfc-client-ip` déjà en place**. Backend
  régénère le traceId s'il manque.
- Le `traceId` (dans l'ALS) **s'auto-injecte** dans : **logs structurés**, **chaque
  ligne du journal** (`activity_event.traceId`), et l'**enveloppe d'erreur**
  (`AppErrorFilter` renvoie un `requestId` → corrélation support).
- `x-lfc-request-time` sert **uniquement** à la latence/observabilité, jamais au métier.

### 1.5 Dette Clock/Id à régler dans la foulée
Migrer vers `Clock` + `IdGenerator(ULID)` ce qu'on a **déjà livré** au mauvais endroit :
- `Company.activate(new Date())` (tranche C), settlement `Order` (`markPaid` → `new Date()`),
- **numéro de commande** (`Date.now()` + `Math.random()`) et **référence société** (`Math.random()`),
- occurrences d'abonnement / toute écriture de date.

> Non cosmétique : le growth engine est **100 % temporel** → intestable sans Clock, et
> on a **3 agrégats** qui lisent l'horloge au mauvais niveau.

---

## 2. Phase 0 — Le journal d'événements (`activity_event`)

**La seule chose non rattrapable.** Capturer l'histoire dès maintenant.

### 2.1 Schéma (révisé par la revue)
```
id             ULID  @id           -- triable par le temps
type           String              -- ex. "order.placed"
schemaVersion  Int    @default(1)  -- le payload évolue → versionné
occurredAt     DateTime            -- temps de l'ÉVÉNEMENT (métier)
recordedAt     DateTime            -- temps d'INGESTION (≠ occurredAt : tardif/rejoué)
subjectType    String              -- "user" | "company" | "lead"
subjectId      String
establishmentId String?            -- posé maintenant, rempli plus tard (identity resolution)
actorType      String              -- "customer" | "staff" | "system"
traceId        String              -- corrélation bout-en-bout
idempotencyKey String @unique      -- anti double-comptage (émission rejouée)
payload        Json
```
- **Append-only** : jamais d'`UPDATE`/`DELETE`.
- **Index** : `(subjectType, subjectId, occurredAt)`, `(type, occurredAt)`, `(establishmentId, occurredAt)`.
- **Stockage UTC** (Instant) ; le **bucketing** (momentum 14 j, cohortes « semaine ») se
  fait en **Europe/Paris** (décision : c'est là que tombe la frontière de semaine).
- **Argent** : les payloads monétaires en **centimes entiers** (jamais de float dans l'analytics).
- **Partition mensuelle + rétention** dès le schéma (append-only grandit sans fin).

### 2.2 Émission
Publier un domain-event (via `EventBus` `@nestjs/cqrs`) → un subscriber `ActivityRecorder`
(port + adaptateur) append dans le journal, en lisant `now`/`traceId` du **RequestContext**.
- **Idempotent** (via `idempotencyKey`) et **non bloquant** : un échec d'append ne casse
  **jamais** la transaction métier (best-effort + retry).
- Événements source à câbler sur l'existant : `user.registered`, `order.placed`,
  `company.declared` (self via `declareOwnedBy` / staff via `declareUnowned`),
  `company.step_reached` (SIRET/TVA/KBIS/adresse), `company.activated`,
  `subscription.created`.

### 2.3 Livrables & périmètre
Migration `activity_event`, `ActivityRecorder` (port+adaptateur), émission sur les 6
événements, tests (avec `FixedClock`). **Aucune UI.**

---

## 3. Phase 1 — Vues dérivées **du journal** (projections)

- **Prospects** : établissements sans société active. **hot** = a ≥1 `order.placed`
  (companyId null) ; **mid** = aucun. Enrichi : contact, nb commandes, total (cents),
  dernière commande (récence).
- **Momentum** : commandes `[J-14,J]` vs `[J-28,J-14]` → `accélère|stable|refroidit|dormant`
  + jours-depuis-dernière-commande. Fenêtres calculées via `Clock` (bucket Europe/Paris).
- **Frictions** : depuis `company.step_reached`, taux de complétion + temps par étape ;
  `pending` bloqué N jours = **adoption-stalled**.
- **adoption+** : `company.declared(self)` **et** aucune interaction staff dans le journal.
- **Surface** : `growth/http/admin-prospects.controller.ts`, `AdminAuthGuard`,
  `GET /admin/prospects` ; reader (CQRS query), pas d'agrégat.
- **Front** : onglet **Prospects** (fold data-table + view-toggle hot/mid), badges.

---

## 4. Phase 1.5 — Score & queue

- **Score** = **fonction pure** (domain service) : `récence × fréquence × montant ×
  momentum × récurrence(abonnement)`. Lisible, auditable, pas de boîte noire.
- **Read-model matérialisé** `lead_score` (+ momentum, frictions), **recalculé par cron
  3×/jour** (04h/12h/20h, cf. §0.8) — **pas** sur événement, **pas** on-read (recomputer
  tout le journal à chaque affichage = fondu). Le dashboard **lit le read-model**, jamais
  le journal brut.
- **Déclenchement du cron : Cloudflare Cron Trigger** (Worker) → `POST /admin/recompute`
  (protégé), **pas** un `@nestjs/schedule` in-process : le container **dort** (`sleepAfter`)
  → un scheduler interne ne se déclencherait pas de façon fiable. Le Worker réveille le
  container à l'heure dite.
- **Queue** « 5 meilleurs coups du jour », **typée par play** (verrouille / rescousse /
  upgrade / win-back) — pas un tri unique qui mélange les motions.
- **On logue `reco.shown` dès maintenant** (pour la boucle fermée en Phase 2) — capturer
  d'abord, exploiter ensuite.

> **Périmètre actuel** : **pas encore de suivi de commandes** (statuts préparation→livré)
> dans le journal — le momentum se calcule sur `order.placed` (rythme de **passation**),
> pas sur le cycle de fulfillment. Les événements de suivi commande viendront plus tard.

---

## 5. Phase 2 — Boucle fermée, lift, moteur d'offre

- **Issues** : `action.logged` + `outcome.logged` → chaîne `reco.shown → action →
  outcome` mesurable (reliée par `traceId`).
- **Recalibrage** : ajuster les poids du score selon ce qui convertit (règle-based ;
  ML seulement quand la donnée le justifie).
- **Lift incrémental / holdout** : fraction de leads éligibles **sans action** (témoin)
  → taux de conversion incrémental → ROI **falsifiable**.
- **Moteur d'offre** : levier matché au comportement (mix produit → abonnement ciblé,
  volume → prix dégressif, régulier → terme différé).

---

## 6. Phase 3 — Établissement, cycle de vie, cohortes

- **Identity resolution** : fusionner comptes → **établissement** (`establishmentId`
  déjà en place), rattacher multi-sites ; **historique de fusion append-only, réversible**.
- **Cycle de vie côté client** : le **même** moteur momentum → **risque de churn** →
  file win-back. L'acquisition ne s'arrête plus à `active`.
- **Cohortes** : funnels + rétention **dans le temps** (par semaine d'inscription,
  Europe/Paris).
- **Boucle produit** : chiffrer chaque friction → backlog → mesurer la réparation.
- **cold** : écran de saisie (agrégat `Lead`) + rapprochement à l'inscription.

---

## 7. Transverse — suppression avant reco

Couche de **suppression** (pas un patch par-ci par-là) : **contactabilité** (numéro/e-mail),
**consentement** (RGPD outbound), **fatigue** (plafond de fréquence). Appliquée avant tout
affichage de reco.

---

## 8. Découpe UX (onglets)

Spécifiée dans la doc concept, §13 :
[`espace-commercial-prospects-leads.md#13`](espace-commercial-prospects-leads.md).
Tableau de bord (cockpit) · Prospects · Comptes clients · Activation & frictions ·
Calendrier/RDV · Croissance — + la **fiche établissement** transverse (frise
d'événements + next best action + actions qui réécrivent dans le journal).

---

## 9. Décisions ouvertes

1. **Poids du score** initial (récence vs fréquence vs montant vs récurrence).
2. **Fenêtres** par play (48 h hot chaud ? délai de rescousse d'un stalled ?).
3. **Taille du holdout** (combien de leads « sacrifiés » pour prouver le lift).
4. **Catalogue d'offres/leviers** (abonnement, prix volume, termes).
5. **Statuts de l'agrégat `Lead`** (pipeline explicite ? contacté o/n ?).
6. **Clé d'identity resolution** (SIRET fiable ? e-mail ? validation staff ?).
7. **Lib ULID** + **CLS** (`nestjs-cls` vs ALS brut) — à figer à l'implémentation.

---

## 10. Repères de code

| Sujet | Où |
|---|---|
| RequestContext / Clock / IdGenerator | `infra/context/`, `infra/time/`, `infra/id/` (cross-cutting) |
| Bus d'événements | `@nestjs/cqrs` `EventBus` (déjà en place) |
| Gateway (propagation) | `gateway/src/index.ts` — pattern `x-lfc-client-ip` existant, + `traceparent` / `x-lfc-request-time` |
| Événements source | `orders/`, `account/`, `subscriptions/` |
| self vs staff (adoption+) | `Company.declare` / `declareOwnedBy` vs `declareUnowned` |
| Dette Clock/Id | `Company.activate`, `PrismaOrderRepository.markPaid`, `generateOrderNumber`, `drawCompanyReference` |
| Surface staff + mur | `AdminAuthGuard`, `admin-*.controller.ts` |
