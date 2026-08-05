import { Test } from '@nestjs/testing';

import { CatalogueReader } from '../../../../catalogue/domain/ports/catalogue-reader.js';
import type { ProductRecord } from '../../../../catalogue/domain/ports/product.repository.js';
import { PrismaService } from '../../../../infra/database/prisma.service.js';
import type { ChannelMode } from '../../shared/settings.service.js';
import { ShopifySettingsService } from '../../shared/settings.service.js';
import { DryRunShopifyDriver, LiveShopifyDriver } from '../driver.js';
import {
  fingerprint,
  projectProduct,
  type ShopifyProductPayload,
} from '../projection.js';
import { ShopifyPushService } from '../push.service.js';
import type { RecordSnapshotInput } from '../snapshot.service.js';
import { ShopifySnapshotService } from '../snapshot.service.js';

function product(): ProductRecord {
  return {
    id: 'p1',
    sku: 'PATI-CROISSANT',
    name: { fr: 'Croissant' },
    slug: { fr: 'croissant' },
    kind: 'daily',
    categoryId: 'c1',
    status: 'draft',
    variants: [
      {
        id: 'v1',
        sku: 'PATI-CROISSANT',
        name: { fr: 'Nature' },
        options: {},
        isDefault: true,
        isDiscontinued: false,
        position: 0,
        priceCents: 130,
      },
    ],
  };
}

interface UpsertArg {
  create: { headSnapshotId?: string };
}

interface Harness {
  service: ShopifyPushService;
  recorded: RecordSnapshotInput[];
  livePushes: ShopifyProductPayload[];
  dryPushes: ShopifyProductPayload[];
  bindingUpserts: UpsertArg[];
  setLoad: (value: {
    id: string;
    version: number;
    productId: string;
    payload: ShopifyProductPayload;
  }) => void;
  loadArgs: [string, number][];
}

async function build(
  mode: ChannelMode,
  bindingRow: { lastPushedHash: string } | null = null,
): Promise<Harness> {
  const recorded: RecordSnapshotInput[] = [];
  const livePushes: ShopifyProductPayload[] = [];
  const dryPushes: ShopifyProductPayload[] = [];
  const bindingUpserts: UpsertArg[] = [];
  const loadArgs: [string, number][] = [];
  let loadValue: {
    id: string;
    version: number;
    productId: string;
    payload: ShopifyProductPayload;
  } | null = null;

  const snapshots = {
    record: (input: RecordSnapshotInput) => {
      recorded.push(input);
      return Promise.resolve({ id: 'snap_1' });
    },
    load: (handle: string, version: number) => {
      loadArgs.push([handle, version]);
      return Promise.resolve(loadValue);
    },
  };

  const prisma = {
    shopifyProductBinding: {
      findUnique: () => Promise.resolve(bindingRow),
      upsert: (arg: UpsertArg) => {
        bindingUpserts.push(arg);
        return Promise.resolve({});
      },
    },
    shopifyVariantBinding: { upsert: () => Promise.resolve({}) },
    product: { findUnique: () => Promise.resolve({ sku: 'PATI-CROISSANT' }) },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ShopifyPushService,
      {
        provide: CatalogueReader,
        useValue: { byIds: () => Promise.resolve([product()]) },
      },
      {
        provide: ShopifySettingsService,
        useValue: { read: () => Promise.resolve({ mode }) },
      },
      {
        provide: DryRunShopifyDriver,
        useValue: {
          mode: 'dry-run',
          push: (p: ShopifyProductPayload) => {
            dryPushes.push(p);
            return Promise.resolve({ productGid: null, variantGids: {} });
          },
        },
      },
      {
        provide: LiveShopifyDriver,
        useValue: {
          mode: 'live',
          push: (p: ShopifyProductPayload) => {
            livePushes.push(p);
            return Promise.resolve({
              productGid: 'gid://shopify/Product/1',
              variantGids: {},
            });
          },
        },
      },
      { provide: PrismaService, useValue: prisma },
      { provide: ShopifySnapshotService, useValue: snapshots },
    ],
  }).compile();

  return {
    service: moduleRef.get(ShopifyPushService),
    recorded,
    livePushes,
    dryPushes,
    bindingUpserts,
    setLoad: (value) => {
      loadValue = value;
    },
    loadArgs,
  };
}

describe('ShopifyPushService — snapshots', () => {
  it('en live, écrit un snapshot et fait pointer le head (BASE)', async () => {
    const h = await build('live');

    await h.service.push(['p1']);

    expect(h.recorded[0]).toMatchObject({
      handle: 'croissant',
      mode: 'live',
      outcome: 'pushed',
    });
    expect(h.bindingUpserts[0]?.create.headSnapshotId).toBe('snap_1');
  });

  it('en dry-run, écrit un snapshot mais n’avance PAS le head', async () => {
    const h = await build('dry-run');

    await h.service.push(['p1']);

    expect(h.recorded[0]?.mode).toBe('dry_run');
    expect(h.bindingUpserts[0]?.create.headSnapshotId).toBeUndefined();
  });

  it('en pré-push (preview), ne pousse rien et n’écrit rien', async () => {
    const h = await build('live');

    const summary = await h.service.push(['p1'], true);

    expect(summary.mode).toBe('dry-run');
    expect(summary.results[0]?.outcome).toBe('pushed');
    expect(summary.results[0]?.message).toContain('Partirait');
    expect(h.livePushes).toHaveLength(0);
    expect(h.dryPushes).toHaveLength(0);
    expect(h.recorded).toHaveLength(0);
    expect(h.bindingUpserts).toHaveLength(0);
  });

  it('en pré-push, rapporte « déjà à jour » si l’empreinte est identique', async () => {
    const hash = fingerprint(projectProduct(product()));
    const h = await build('live', { lastPushedHash: hash });

    const summary = await h.service.push(['p1'], true);

    expect(summary.results[0]?.outcome).toBe('unchanged');
    expect(h.bindingUpserts).toHaveLength(0);
  });

  it('sur empreinte identique, ne pousse ni n’écrit de snapshot', async () => {
    const hash = fingerprint(projectProduct(product()));
    const h = await build('live', { lastPushedHash: hash });

    const summary = await h.service.push(['p1']);

    expect(summary.results[0]?.outcome).toBe('unchanged');
    expect(h.livePushes).toHaveLength(0);
    expect(h.recorded).toHaveLength(0);
  });
});

describe('ShopifyPushService — rollback', () => {
  it('re-pousse le payload figé de la version ciblée et journalise une nouvelle version', async () => {
    const h = await build('live');
    const payload = projectProduct(product());
    h.setLoad({ id: 'snap_7', version: 2, productId: 'p1', payload });

    const report = await h.service.rollback('croissant', 2);

    expect(h.loadArgs[0]).toEqual(['croissant', 2]);
    expect(h.livePushes[0]).toEqual(payload);
    expect(h.recorded[0]).toMatchObject({
      handle: 'croissant',
      productId: 'p1',
    });
    expect(report.outcome).toBe('pushed');
    expect(report.message).toContain('v2');
  });
});
