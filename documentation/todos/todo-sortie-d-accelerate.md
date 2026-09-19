# TODO — sortir d'Accelerate, le week-end du 19–20 septembre 2026

> **Posé le 2026-09-15** à la demande de Hugo, pour le week-end du **samedi 19 et
> dimanche 20 septembre 2026** : moins de trafic client, et le temps de vérifier.
> Échéance Prisma : **1er décembre 2026** — après, la production ne joint plus sa
> base. Le plan, ses raisons et l'ordre des gestes :
> [`../ops/plan-sortie-d-accelerate.md`](../ops/plan-sortie-d-accelerate.md) —
> **contredit par `vitruve` le 2026-09-15**, objections intégrées (§7 du plan).

## À trancher par Hugo avant de commencer

- [x] **Répétition** (plan §2.6) : **B** — premier essai en production, assumé
      (Hugo, 2026-09-19 : « direct B »). Pas de seconde base.
- [x] **Dev applicatif** : aucune autre base que la production ne passe par
      Accelerate (Hugo, 2026-09-19).

## Avant le week-end (sans effet en production)

- [x] **Code** (Claude, geste 1) — fait le 2026-09-19 (`529414d3`, docs
      `703df520`) : outils locaux verrouillés (`clone-dev`,
      `reset-growth`, `seed-fiche`, `seed:growth`, `seed:delivery`,
      `backfill-naf`), `import-mercuriale` sur une variable de production
      dédiée ; pool `pg` réglé (`max`, délai d'acquisition) et
      `enableShutdownHooks` ; `P2037` classé « base indisponible » ; `/health`
      publie le transport ; workflow : migration par l'URL directe, contrôle du
      transport ; JSDoc, `.env.example` et docs.
- [ ] **Console Prisma** (Hugo, geste 2) : URL mutualisée, URL directe — ✅
      générées le 2026-09-19 ; reste à relever la **région** et la **limite de
      connexions** du plan.
- [x] **GitHub** (Hugo, geste 3, par l'interface) : créer
      `DATABASE_LFD_PROD_DIRECT_URL` et `DATABASE_LFD_PROD_URL` (URL
      mutualisée) — ✅ créés le 2026-09-19 ; copier la valeur actuelle de `DATABASE_LFD_URL`
      dans le gestionnaire de mots de passe.
- [x] **Merge** (Claude, geste 4) — déployé le 2026-09-19 (`137b063f`, sans le
      reste de `dev`) : migration par `db.prisma.io`, `/health` → `accelerate` : batterie verte ; l'API se redéploie **encore
      sur Accelerate**, `/health` doit publier `accelerate`.

## Le week-end

- ~~(option A) **Répétition** sur la seconde base (geste 5)~~ — sans objet,
  option B retenue le 2026-09-19.
- [x] **La bascule** (geste 6) — déployée le 2026-09-19 au soir (`07fff0c4`) :
      `/health` → `"database":"pg"`, révision `07fff0c`, contrôles verts : Claude pousse UN commit — la synchro lit
      `DATABASE_LFD_PROD_URL` (URL mutualisée), le contrôle attend `pg` ; le
      déploiement échoue si `/health` ne le publie pas.
- [ ] **Vérifier** (geste 7) : contrôle du mur, sonde `postgres-b2b`, écran
      admin, connexion client, commande de test, vitals avant / après, console
      Prisma sans trafic Accelerate.
- [ ] **Si ça ne va pas** (geste 7′) : `git revert` du commit de bascule,
      poussé — `DATABASE_LFD_URL` a gardé la valeur Accelerate.

⚠️ **Ne pas toucher `DATABASE_LFD_URL`** jusqu'au resserrement : c'est le
retour arrière (Hugo, 2026-09-19 : la bascule passe par un secret à part,
`DATABASE_LFD_PROD_URL`).

## Quelques jours après

- [ ] **Révoquer la clé Accelerate** (Hugo) — après avoir vérifié que les
      nouveaux identifiants n'en dépendent pas ; ferme aussi la fuite de clé.
- [ ] **Resserrer** (Claude, geste 8) : retirer la branche `accelerateUrl` du
      service et des scripts, et la valeur `accelerate` du contrôle.
