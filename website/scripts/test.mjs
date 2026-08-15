import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = await readFile(path.join(websiteRoot, "dist", "index.html"), "utf8");
const changelog = await readFile(path.join(websiteRoot, "dist", "changelog.html"), "utf8");

assert.equal(index.match(/data-mock-table/g)?.length, 6);
assert.match(index, /href="\.\/changelog\.html"/);
assert.match(index, /codicon-database/);
assert.match(index, /codicon-table/);
assert.match(index, /codicon-zap/);
assert.doesNotMatch(changelog, /CHANGELOG_CONTENT/);
assert.match(changelog, /Added a website changelog/);
assert.match(changelog, /\[0\.3\.0\]/);

console.log("Website content checks passed.");
