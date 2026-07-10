#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const sourceDirectory = path.resolve(
  process.argv[2] ?? process.env.VFR_TILES_DIR ?? "public/vfr-chart"
);
const projectUrl = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const secretKey =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "";
const bucket = process.env.VFR_STORAGE_BUCKET ?? "vfr-chart";
const prefix = (process.env.VFR_STORAGE_PREFIX ?? "anc-portugal-500k/2022")
  .replace(/^\/+|\/+$/g, "");
const concurrency = Math.max(
  1,
  Number.parseInt(process.env.VFR_UPLOAD_CONCURRENCY ?? "8", 10) || 8
);

if (!projectUrl || !secretKey) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) before uploading."
  );
  process.exit(1);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);

      return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
    })
  );

  return files.flat();
}

function storagePathForFile(filePath) {
  const relativePath = path
    .relative(sourceDirectory, filePath)
    .split(path.sep)
    .join("/");

  if (!/^\d+\/\d+\/\d+\.png$/.test(relativePath)) {
    return null;
  }

  return `${prefix}/${relativePath}`;
}

const supabase = createClient(projectUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: existingBucket, error: getBucketError } =
  await supabase.storage.getBucket(bucket);

if (getBucketError && !getBucketError.message.toLowerCase().includes("not found")) {
  throw getBucketError;
}

if (existingBucket) {
  const { error } = await supabase.storage.updateBucket(bucket, {
    public: true,
    allowedMimeTypes: ["image/png"],
    fileSizeLimit: "5MB",
  });

  if (error) throw error;
} else {
  const { error } = await supabase.storage.createBucket(bucket, {
    public: true,
    allowedMimeTypes: ["image/png"],
    fileSizeLimit: "5MB",
  });

  if (error) throw error;
}

const sourceFiles = (await walk(sourceDirectory))
  .map((filePath) => ({ filePath, storagePath: storagePathForFile(filePath) }))
  .filter((file) => file.storagePath !== null);

if (sourceFiles.length === 0) {
  throw new Error(`No XYZ PNG tiles were found in ${sourceDirectory}`);
}

let nextIndex = 0;
let uploaded = 0;

async function uploadWorker() {
  while (nextIndex < sourceFiles.length) {
    const index = nextIndex;
    nextIndex += 1;
    const file = sourceFiles[index];
    const bytes = await readFile(file.filePath);
    const { error } = await supabase.storage
      .from(bucket)
      .upload(file.storagePath, bytes, {
        cacheControl: "31536000",
        contentType: "image/png",
        upsert: true,
      });

    if (error) {
      throw new Error(`Upload failed for ${file.storagePath}: ${error.message}`);
    }

    uploaded += 1;

    if (uploaded % 100 === 0 || uploaded === sourceFiles.length) {
      console.log(`Uploaded ${uploaded}/${sourceFiles.length} tiles`);
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(concurrency, sourceFiles.length) }, () =>
    uploadWorker()
  )
);

console.log("Upload complete.");
console.log(
  `NEXT_PUBLIC_VFR_CHART_TILES_URL=${projectUrl}/storage/v1/object/public/${bucket}/${prefix}/{z}/{x}/{y}.png`
);
