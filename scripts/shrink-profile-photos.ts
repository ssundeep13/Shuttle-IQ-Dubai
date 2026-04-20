import path from "path";
import fs from "fs";
import sharp from "sharp";
import { db } from "../server/db";
import { marketplaceUsers } from "@shared/schema";
import { eq } from "drizzle-orm";

const PROFILE_AVATAR_SIZE = 256;
const ALLOWED_INPUT_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

const profilePhotoDir = path.resolve(process.cwd(), "uploads/profile");

type Stats = {
  scanned: number;
  skipped: number;
  resized: number;
  renamed: number;
  dbUpdated: number;
  errors: number;
  bytesBefore: number;
  bytesAfter: number;
};

async function processFile(filename: string, stats: Stats): Promise<void> {
  const fullPath = path.join(profilePhotoDir, filename);
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(fullPath);
  } catch {
    return;
  }
  if (!stat.isFile()) return;

  stats.scanned += 1;
  const sizeBefore = stat.size;

  let meta: sharp.Metadata;
  try {
    meta = await sharp(fullPath, { animated: false }).metadata();
  } catch (err) {
    console.warn(`[shrink] Skipping non-image file: ${filename}`, err instanceof Error ? err.message : err);
    stats.errors += 1;
    return;
  }

  if (!meta.format || !ALLOWED_INPUT_FORMATS.has(meta.format)) {
    console.warn(`[shrink] Skipping unsupported format (${meta.format}): ${filename}`);
    stats.errors += 1;
    return;
  }

  const isWebp = meta.format === "webp";
  const fitsAvatar =
    (meta.width ?? Number.POSITIVE_INFINITY) <= PROFILE_AVATAR_SIZE &&
    (meta.height ?? Number.POSITIVE_INFINITY) <= PROFILE_AVATAR_SIZE;

  if (isWebp && fitsAvatar) {
    stats.skipped += 1;
    stats.bytesBefore += sizeBefore;
    stats.bytesAfter += sizeBefore;
    return;
  }

  let resized: Buffer;
  try {
    resized = await sharp(fullPath, { animated: false })
      .rotate()
      .resize(PROFILE_AVATAR_SIZE, PROFILE_AVATAR_SIZE, {
        fit: "cover",
        position: "centre",
        withoutEnlargement: false,
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (err) {
    console.error(`[shrink] Failed to resize ${filename}:`, err);
    stats.errors += 1;
    return;
  }

  const ext = path.extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  const newFilename = ext.toLowerCase() === ".webp" ? filename : `${base}.webp`;
  const newFullPath = path.join(profilePhotoDir, newFilename);

  const tmpPath = `${newFullPath}.tmp-${process.pid}`;
  try {
    await fs.promises.writeFile(tmpPath, resized);
    await fs.promises.rename(tmpPath, newFullPath);
  } catch (err) {
    console.error(`[shrink] Failed to write ${newFilename}:`, err);
    try { await fs.promises.unlink(tmpPath); } catch {}
    stats.errors += 1;
    return;
  }

  stats.resized += 1;
  stats.bytesBefore += sizeBefore;
  stats.bytesAfter += resized.length;

  if (newFilename !== filename) {
    stats.renamed += 1;
    const oldUrl = `/uploads/profile/${filename}`;
    const newUrl = `/uploads/profile/${newFilename}`;
    let dbOk = false;
    try {
      const result = await db
        .update(marketplaceUsers)
        .set({ photoUrl: newUrl })
        .where(eq(marketplaceUsers.photoUrl, oldUrl))
        .returning({ id: marketplaceUsers.id });
      dbOk = true;
      if (result.length > 0) {
        stats.dbUpdated += result.length;
        console.log(`[shrink] Updated ${result.length} user(s) photoUrl: ${filename} -> ${newFilename}`);
      }
    } catch (err) {
      console.error(`[shrink] DB update failed for ${filename} -> ${newFilename}:`, err);
      stats.errors += 1;
    }

    if (!dbOk) {
      // Roll back the new file so the old URL still resolves and the next
      // run can retry. Leave the old file untouched.
      try {
        await fs.promises.unlink(newFullPath);
      } catch (rollbackErr) {
        console.warn(
          `[shrink] Failed to roll back new file ${newFilename}:`,
          rollbackErr instanceof Error ? rollbackErr.message : rollbackErr,
        );
      }
      stats.resized -= 1;
      stats.renamed -= 1;
      stats.bytesAfter -= resized.length;
      stats.bytesAfter += sizeBefore;
      return;
    }

    try {
      await fs.promises.unlink(path.join(profilePhotoDir, filename));
    } catch (err) {
      console.warn(`[shrink] Could not remove old file ${filename}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `[shrink] ${filename} (${sizeBefore} B, ${meta.width}x${meta.height} ${meta.format}) -> ${newFilename} (${resized.length} B)`,
  );
}

async function main() {
  if (!fs.existsSync(profilePhotoDir)) {
    console.log(`[shrink] Profile directory does not exist: ${profilePhotoDir}`);
    return;
  }
  const entries = await fs.promises.readdir(profilePhotoDir);
  const stats: Stats = {
    scanned: 0,
    skipped: 0,
    resized: 0,
    renamed: 0,
    dbUpdated: 0,
    errors: 0,
    bytesBefore: 0,
    bytesAfter: 0,
  };

  for (const filename of entries) {
    if (filename.startsWith(".")) continue;
    if (filename.includes(".tmp-")) continue;
    await processFile(filename, stats);
  }

  console.log("\n[shrink] Done.");
  console.log(`  Files scanned : ${stats.scanned}`);
  console.log(`  Already small : ${stats.skipped}`);
  console.log(`  Resized       : ${stats.resized}`);
  console.log(`  Renamed       : ${stats.renamed}`);
  console.log(`  DB rows updated: ${stats.dbUpdated}`);
  console.log(`  Errors        : ${stats.errors}`);
  const savedKb = Math.max(0, (stats.bytesBefore - stats.bytesAfter) / 1024).toFixed(1);
  console.log(`  Bytes before  : ${stats.bytesBefore}`);
  console.log(`  Bytes after   : ${stats.bytesAfter}`);
  console.log(`  Saved         : ${savedKb} KB`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[shrink] Fatal error:", err);
    process.exit(1);
  });
