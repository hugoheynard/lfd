import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import {
  SHOP_COPY_AUDIENCES,
  SHOP_COPY_PREVIEW_SOURCE,
  shopCopyPreviewStepsOf,
  type ShopCopyAudience,
  type ShopCopyPreviewStep,
} from '@lfd/contracts/shop-copy-preview';

import { EXTRA_SCENES, type ExtraScene } from './extra-scenes';

/**
 * **La porte axe de la boutique** — chaque scène de l'aperçu, à deux largeurs,
 * passée à axe-core sur les règles WCAG 2.0 A/AA, 2.1 AA et 2.2 AA
 * (`documentation/accessibilite/porte-axe.md`).
 *
 * Ce fichier ne JUGE pas : il relève les violations et les écrit, une scène par
 * fichier, dans `tmp/axe-results/`. La comparaison à la référence comptée vit
 * dans `dev-toolbox/accessibilite/axe-gate.mjs`, qui seul décide.
 *
 * L'aperçu ne démarre la boutique que s'il est ouvert par le back-office : on
 * simule donc l'éditeur — une page servie par `page.route` à son origine de
 * dev, qui ouvre l'aperçu et lui envoie `show`, comme la fenêtre détachée.
 */

declare global {
  /** Ce que l'éditeur simulé tient sur sa fenêtre. */
  interface Window {
    __ready: boolean;
    __keysAt: number;
    previewWindow: Window | null;
  }
}

const EDITOR_ORIGIN = 'http://127.0.0.1:7317';
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const WIDTHS = [1280, 320] as const;
/** Le calme du DOM exigé après la dernière mutation avant d'analyser. */
const QUIET_MS = 1000;

/**
 * L'heure gelée du navigateur. Les jours et créneaux de la démonstration se
 * calculent depuis elle : sans la geler, le nombre de créneaux — donc de
 * nœuds en violation — changerait avec l'heure du run. Un mardi matin, la
 * boutique ouverte. C'est l'horloge elle-même, pas une donnée comparée à elle.
 */
const FROZEN_NOW = new Date('2026-10-27T08:00:00+01:00');

interface Scene {
  readonly audience: ShopCopyAudience;
  readonly step: ShopCopyPreviewStep;
  readonly extra: ExtraScene | null;
}

function allScenes(): readonly Scene[] {
  const base = SHOP_COPY_AUDIENCES.flatMap((audience) =>
    shopCopyPreviewStepsOf(audience).map((step) => ({ audience, step, extra: null })),
  );
  const extras = EXTRA_SCENES.map((extra) => ({
    audience: extra.audience,
    step: extra.step,
    extra,
  }));
  return [...base, ...extras];
}

function sceneId(scene: Scene): string {
  const name = `${scene.audience}/${scene.step}`;
  return scene.extra === null ? name : `${name}+${scene.extra.name}`;
}

/** L'éditeur simulé : il ouvre l'aperçu et note chaque message reçu. */
const EDITOR_HTML = `<!doctype html><html lang="fr"><head><title>Éditeur simulé</title></head><body><script>
window.__keysAt = 0;
window.__ready = false;
window.addEventListener('message', (event) => {
  if (event.data?.type === 'ready') window.__ready = true;
  if (event.data?.type === 'visible-keys') window.__keysAt = performance.now();
});
</script></body></html>`;

async function openPreview(editor: Page, previewUrl: string): Promise<Page> {
  await editor.route(`${EDITOR_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: EDITOR_HTML }),
  );
  await editor.goto(`${EDITOR_ORIGIN}/`);
  const [preview] = await Promise.all([
    editor.context().waitForEvent('page'),
    editor.evaluate((url) => {
      window.previewWindow = window.open(url);
    }, previewUrl),
  ]);
  await editor.waitForFunction(() => window.__ready);
  return preview;
}

async function show(editor: Page, scene: Scene, previewOrigin: string, width: number): Promise<void> {
  const message = {
    source: SHOP_COPY_PREVIEW_SOURCE,
    type: 'show',
    audience: scene.audience,
    step: scene.step,
    locale: 'fr',
    viewport: width < 1000 ? 'mobile' : 'desktop',
    drafts: {},
    published: {},
    highlight: null,
  };
  await editor.evaluate(
    ([msg, origin]) => {
      window.previewWindow?.postMessage(msg, origin);
    },
    [message, previewOrigin] as const,
  );
}

/** Attend que l'aperçu ait annoncé ses textes, puis que son DOM se taise. */
async function settle(editor: Page, preview: Page): Promise<void> {
  await editor.waitForFunction(
    (quiet) => {
      const at = window.__keysAt;
      return at > 0 && performance.now() - at > quiet;
    },
    QUIET_MS,
    { polling: 200 },
  );
  await preview.waitForLoadState('networkidle');
  // L'écran « hors cadre » de l'aperçu est aussi un `app-root` : sans la
  // coque de la boutique, la scène n'a pas démarré, et l'analyser mentirait.
  await preview.locator('fold-app-shell').first().waitFor({ state: 'attached' });
}

for (const scene of allScenes()) {
  for (const width of scene.extra?.widths ?? WIDTHS) {
    const id = `${sceneId(scene)}@${width}`;
    test(id, async ({ page, baseURL }) => {
      expect(baseURL).toBeDefined();
      const previewOrigin = new URL(baseURL ?? '').origin;
      await page.context().clock.setFixedTime(FROZEN_NOW);
      const preview = await openPreview(page, `${previewOrigin}/`);
      await preview.setViewportSize({ width, height: 900 });
      await show(page, scene, previewOrigin, width);
      await settle(page, preview);
      if (scene.extra !== null) {
        await scene.extra.enter(preview);
        await preview.waitForTimeout(QUIET_MS);
      }
      const results = await new AxeBuilder({ page: preview }).withTags(AXE_TAGS).analyze();
      const counts: Record<string, number> = {};
      for (const violation of results.violations) {
        counts[violation.id] = violation.nodes.length;
      }
      // `rootDir` est le `testDir` de la configuration : `a11y/`.
      const resultsDir = resolve(test.info().config.rootDir, '../tmp/axe-results');
      mkdirSync(resultsDir, { recursive: true });
      writeFileSync(
        resolve(resultsDir, `${id.replace(/[/@+]/g, '_')}.json`),
        JSON.stringify({ page: id, counts, violations: results.violations }, null, 2),
      );
    });
  }
}
