# Trois e2e ne passent qu'à condition d'être seules

> **Ouvert le 2026-09-21.** Constaté, pas diagnostiqué — chacune a été rejouée
> isolément le jour même et passe.

## Le fait

Sous `pnpm test` à la racine, trois suites échouent **par intermittence** et
passent **systématiquement** quand on les relance seules :

| Suite                          | Le cas qui tombe                                                       |
| ------------------------------ | ---------------------------------------------------------------------- |
| `production-batch.e2e-spec.ts` | un **compte de mails**                                                 |
| `client-notes.e2e-spec.ts`     | « deux écritures simultanées › gardent les trois notes »               |
| `appointments.e2e-spec.ts`     | « les créneaux › ne propose rien tant que rien n'est déclaré »         |
| `app.spec.ts` (boutique)       | « reconnaît TOUS les écrans clients » — **dépassement de délai à 5 s** |
| `shop-page.spec.ts` (boutique) | **aucun test ne rougit** — `EnvironmentTeardownError` après coup       |

⚠️ **Les deux derniers ne sont pas de la même famille**, et la distinction
compte : ils ne rougissent pas sur une assertion. `app.spec.ts` **dépasse les
5 s** de Vitest ; `shop-page.spec.ts` ne fait rougir **aucun test** — les 984
passent — mais le process sort en 1 sur un rejet arrivé APRÈS le démontage de
l'environnement :

```
EnvironmentTeardownError: Cannot load '/chunk-H7CFZMFQ.js' … after the
environment was torn down.
```

Ils ne partagent donc rien avec les trois premiers qu'un symptôme — « rouge en
suite complète, vert seul » — et leur cause est la CHARGE, pas l'ordre. Les
chercher ensemble ferait perdre du temps sur les deux familles.

🔴 **Le cinquième est le plus traître des cinq**, et c'est pour ça qu'il est
inscrit : le rapport dit « 984 passed », et le shell dit `exit 1`. Qui lit le
texte conclut vert ; seul le code de sortie dit l'inverse. Constaté le
2026-09-21 sous `pnpm test` à la racine (14 paquets), **non reproduit** ni en
lançant la boutique seule, ni à quatre paquets en parallèle — vérifié deux fois
le même jour.

## Pourquoi ça compte plus qu'un agacement

🔴 **Une suite qui échoue une fois sur cinq finit par être crue quand elle
ment.** Le coût n'est pas le rouge : c'est qu'on apprend à relancer plutôt qu'à
lire, et le jour où l'une d'elles attrape une vraie régression, personne ne la
croit.

Et les trois portent des sujets où l'ordre compte vraiment — un compteur
d'e-mails partis, une **course** entre deux écritures, une fenêtre de créneaux.
Ce sont exactement les endroits où un état qui bave d'une suite à l'autre
ressemble à un défaut du produit.

## Les trois pistes, par ordre de vraisemblance

1. **Du travail hors requête qui écrit APRÈS le `TRUNCATE`.** `e2e-harness.ts`
   draine avant de vider (`background.whenIdle()`), et son commentaire dit
   précisément pourquoi — « son alerte réapparaît alors dans le test suivant,
   un échec qui accuse le mauvais test, une fois sur sept ». Un abonné qui
   n'est pas dans ce drain reproduit le symptôme.
2. **Un état de module partagé entre suites** — un cache que `ctx.reset()` ne
   vide pas. Le cache des matériaux de prix, lui, est explicitement vidé ;
   d'autres ne le sont peut-être pas.
3. **Une fixture datée relative à `maintenant`** dont la fenêtre se ferme
   pendant que les suites d'avant tournent. Le § 5 du CLAUDE.md a déjà coûté
   ça une fois, dans l'autre sens.

## Ce qu'il ne faut PAS faire

Ne pas les marquer `skip`, et ne pas les « stabiliser » en élargissant une
attente. Ce qui rend une de ces suites verte sans en comprendre la cause enlève
le seul signal qui reste.

**Le geste utile** pour les trois premières : lancer la suite complète en boucle
jusqu'à reproduire, puis relancer la seule suite qui précède immédiatement celle
qui tombe. C'est l'ordre, donc le coupable est devant.

Pour la quatrième, la question est autre : ce cas monte l'app ENTIÈRE et la
route sur chaque écran client. Cinq secondes lui suffisent à froid et plus
toujours quand turbo fait tourner quatre paquets à côté. Soit il mérite son
propre délai — assumé, écrit —, soit il en fait trop pour un test de chrome.
