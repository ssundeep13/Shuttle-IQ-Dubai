// Gate FV: single source of truth for the local uploads root. On Railway the
// service sets UPLOADS_DIR=/data/uploads (a mounted volume) so uploaded files
// survive redeploys; locally the default keeps ./uploads and dev unchanged.
// The directory tree is created at import time so a fresh volume (or fresh
// checkout) works on first boot.
import path from "path";
import fs from "fs";

export const UPLOADS_ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), "uploads");

export const BLOG_UPLOADS_DIR = path.join(UPLOADS_ROOT, "blog");
export const PROFILE_UPLOADS_DIR = path.join(UPLOADS_ROOT, "profile");

for (const dir of [UPLOADS_ROOT, BLOG_UPLOADS_DIR, PROFILE_UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
