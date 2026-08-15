import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(websiteRoot, "src");
const outputDirectory = path.join(websiteRoot, "dist");

const requiredFiles = ["index.html", "styles.css", ".nojekyll"];

for (const relativePath of requiredFiles) {
  const candidate = path.join(sourceDirectory, relativePath);
  if (!(await stat(candidate)).isFile()) {
    throw new Error(`Required website file is missing: ${relativePath}`);
  }
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(sourceDirectory, outputDirectory, { recursive: true });

const outputFiles = await readdir(outputDirectory);
console.log(`Built website with ${outputFiles.length} top-level file(s) in ${outputDirectory}.`);
