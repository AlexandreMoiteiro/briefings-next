#!/usr/bin/env node

import {
  access,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  unlink,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { x as extractTar } from "tar";

const projectRoot = process.cwd();
const bundleDirectory = path.join(projectRoot, "data", "vfr-chart-bundle");
const publicDirectory = path.join(projectRoot, "public");
const outputDirectory = path.join(publicDirectory, "vfr-chart");
const archivePath = path.join(os.tmpdir(), `briefings-vfr-chart-${process.pid}.tar.gz`);
const manifest = JSON.parse(
  await readFile(path.join(bundleDirectory, "manifest.json"), "utf8")
);
const partNames = (await readdir(bundleDirectory))
  .filter((name) => name.startsWith("vfr-chart.tar.gz.part-"))
  .sort();

if (partNames.length === 0) {
  throw new Error(`No VFR chart bundle parts found in ${bundleDirectory}`);
}

if (partNames.length !== manifest.partCount) {
  throw new Error(
    `Expected ${manifest.partCount} VFR chart parts, found ${partNames.length}`
  );
}

await mkdir(publicDirectory, { recursive: true });
await rm(outputDirectory, { recursive: true, force: true });

const archive = await open(archivePath, "w");
const archiveHash = createHash("sha256");

try {
  for (const partName of partNames) {
    const part = await readFile(path.join(bundleDirectory, partName));
    archiveHash.update(part);
    await archive.write(part);
  }
} finally {
  await archive.close();
}

const actualArchiveHash = archiveHash.digest("hex");

if (actualArchiveHash !== manifest.archiveSha256) {
  await unlink(archivePath).catch(() => undefined);
  throw new Error(
    `VFR chart bundle checksum mismatch: expected ${manifest.archiveSha256}, received ${actualArchiveHash}`
  );
}

try {
  await extractTar({ file: archivePath, cwd: publicDirectory });
  await access(path.join(outputDirectory, "6", "30", "23.png"));
} finally {
  await unlink(archivePath).catch(() => undefined);
}

console.log(
  `Prepared ${manifest.tileCount} bundled VFR chart tiles from ${partNames.length} parts.`
);
