import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";

import type { IStorageMetrics, StorageOpRecord } from "../storage-metrics.js";

const { S3StorageService } = await import("../S3StorageService.js");
type S3StorageService = InstanceType<typeof S3StorageService>;

const s3Mock = mockClient(S3Client);

class FakeMetrics implements IStorageMetrics {
  records: StorageOpRecord[] = [];
  record(rec: StorageOpRecord): void {
    this.records.push(rec);
  }
}

function svc(metrics?: IStorageMetrics): S3StorageService {
  return new S3StorageService(
    {
      bucket: "sh3-test",
      region: "auto",
      endpoint: "https://r2.example",
      accessKeyId: "k",
      secretAccessKey: "s",
    },
    metrics,
  );
}

beforeEach(() => {
  s3Mock.reset();
});

const IMMUTABLE = "public, max-age=31536000, immutable";

describe("S3StorageService.upload / delete", () => {
  it("uploads with bucket, key, body, content-type", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    await svc().upload("owner/u/x.mp3", Buffer.from("abc"), "audio/mpeg");
    const input = s3Mock.commandCalls(PutObjectCommand)[0].args[0].input;
    expect(input).toMatchObject({
      Bucket: "sh3-test",
      Key: "owner/u/x.mp3",
      ContentType: "audio/mpeg",
    });
  });

  it("passes Cache-Control only when asked", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    await svc().upload("products/ab.jpg", Buffer.from("abc"), "image/jpeg", IMMUTABLE);
    await svc().upload("owner/u/x.mp3", Buffer.from("abc"), "audio/mpeg");
    const [first, second] = s3Mock.commandCalls(PutObjectCommand).map((call) => call.args[0].input);
    expect(first).toMatchObject({ CacheControl: IMMUTABLE });
    expect(second).not.toHaveProperty("CacheControl");
  });

  it("deletes a single key", async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});
    await svc().delete("owner/u/x.mp3");
    expect(s3Mock.commandCalls(DeleteObjectCommand)[0].args[0].input).toMatchObject({
      Bucket: "sh3-test",
      Key: "owner/u/x.mp3",
    });
  });
});

describe("S3StorageService.downloadToBuffer", () => {
  it("returns the bytes via the SDK transform helper", async () => {
    s3Mock.on(GetObjectCommand).resolves({
      // minimal SdkStream stub — only transformToByteArray is used
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    } as never);
    const buf = await svc().downloadToBuffer("k");
    expect([...buf]).toEqual([1, 2, 3]);
  });

  it("throws on an empty body", async () => {
    s3Mock.on(GetObjectCommand).resolves({});
    await expect(svc().downloadToBuffer("k")).rejects.toThrow(/Empty response body/);
  });
});

describe("S3StorageService.deleteByPrefix", () => {
  it("lists by prefix, batch-deletes, returns the count (single page)", async () => {
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [{ Key: "owner/u/a" }, { Key: "owner/u/b" }],
      IsTruncated: false,
    });
    s3Mock.on(DeleteObjectsCommand).resolves({});

    const n = await svc().deleteByPrefix("owner/u/");

    expect(n).toBe(2);
    expect(s3Mock.commandCalls(ListObjectsV2Command)[0].args[0].input).toMatchObject({
      Bucket: "sh3-test",
      Prefix: "owner/u/",
    });
    const del = s3Mock.commandCalls(DeleteObjectsCommand)[0].args[0].input;
    expect(del.Delete?.Objects).toEqual([{ Key: "owner/u/a" }, { Key: "owner/u/b" }]);
  });

  it("follows the continuation token across pages and sums the count", async () => {
    s3Mock
      .on(ListObjectsV2Command)
      .resolvesOnce({ Contents: [{ Key: "p/1" }], IsTruncated: true, NextContinuationToken: "T1" })
      .resolvesOnce({ Contents: [{ Key: "p/2" }, { Key: "p/3" }], IsTruncated: false });
    s3Mock.on(DeleteObjectsCommand).resolves({});

    const n = await svc().deleteByPrefix("owner/u1/");

    expect(n).toBe(3);
    expect(s3Mock.commandCalls(ListObjectsV2Command)).toHaveLength(2);
    // second list page carried the token from the first
    expect(s3Mock.commandCalls(ListObjectsV2Command)[1].args[0].input.ContinuationToken).toBe("T1");
    expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(2);
  });

  it("skips the delete round when a page is empty, returns 0", async () => {
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });
    const n = await svc().deleteByPrefix("owner/empty/");
    expect(n).toBe(0);
    expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
  });

  it.each([
    ["empty", ""],
    ["bare wall", "owner/"],
    ["no trailing slash", "owner/u1"],
    ["leading slash", "/u1/"],
  ])("refuses a too-broad prefix (%s) without listing or deleting", async (_l, prefix) => {
    await expect(svc().deleteByPrefix(prefix)).rejects.toThrow(/too-broad prefix/);
    expect(s3Mock.commandCalls(ListObjectsV2Command)).toHaveLength(0);
    expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
  });

  it("filters out entries with no Key", async () => {
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [{ Key: "p/a" }, {}, { Key: "p/b" }],
      IsTruncated: false,
    });
    s3Mock.on(DeleteObjectsCommand).resolves({});
    const n = await svc().deleteByPrefix("owner/u1/");
    expect(n).toBe(2);
    expect(s3Mock.commandCalls(DeleteObjectsCommand)[0].args[0].input.Delete?.Objects).toEqual([
      { Key: "p/a" },
      { Key: "p/b" },
    ]);
  });
});

describe("S3StorageService — metrics port", () => {
  it("records put with kind from the MIME + bytes", async () => {
    const m = new FakeMetrics();
    s3Mock.on(PutObjectCommand).resolves({});
    await svc(m).upload("owner/u/tracks/v/t/song.mp3", Buffer.from("abcde"), "audio/mpeg");
    expect(m.records).toEqual([
      { op: "put", result: "ok", kind: "audio", durationMs: expect.any(Number), bytes: 5 },
    ]);
  });

  it("records delete_prefix with the deleted count", async () => {
    const m = new FakeMetrics();
    s3Mock
      .on(ListObjectsV2Command)
      .resolves({ Contents: [{ Key: "owner/u1/a" }, { Key: "owner/u1/b" }], IsTruncated: false });
    s3Mock.on(DeleteObjectsCommand).resolves({});
    await svc(m).deleteByPrefix("owner/u1/");
    expect(m.records[0]).toMatchObject({ op: "delete_prefix", result: "ok", deletedCount: 2 });
  });

  it("records result=error when the op throws (and rethrows)", async () => {
    const m = new FakeMetrics();
    s3Mock.on(PutObjectCommand).rejects(new Error("R2 down"));
    await expect(
      svc(m).upload("owner/u/x", Buffer.from("x"), "application/octet-stream"),
    ).rejects.toThrow("R2 down");
    expect(m.records[0]).toMatchObject({ op: "put", result: "error", kind: "other" });
  });

  it("the too-broad-prefix guard throws before any op or metric", async () => {
    const m = new FakeMetrics();
    await expect(svc(m).deleteByPrefix("owner/")).rejects.toThrow(/too-broad/);
    expect(m.records).toHaveLength(0);
  });

  it("is a no-op when no metrics port is provided", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    await expect(
      svc().upload("owner/u/x", Buffer.from("x"), "text/plain"),
    ).resolves.toBeUndefined();
  });
});
