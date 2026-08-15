import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(websiteRoot, "..");
const sourceDirectory = path.join(websiteRoot, "src");
const outputDirectory = path.join(websiteRoot, "dist");
const codiconsDirectory = path.join(websiteRoot, "node_modules", "@vscode", "codicons", "dist");

const requiredFiles = ["index.html", "changelog.html", "styles.css", ".nojekyll"];

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/https:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`);
}

function renderChangelog(markdown) {
  const output = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      output.push("</ul>");
      listOpen = false;
    }
  };

  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("# ")) {
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      output.push(`<h2>${renderInlineMarkdown(line.slice(3))}</h2>`);
    } else if (line.startsWith("- ")) {
      if (!listOpen) {
        output.push("<ul>");
        listOpen = true;
      }
      output.push(`<li>${renderInlineMarkdown(line.slice(2))}</li>`);
    } else if (line.trim()) {
      closeList();
      output.push(`<p>${renderInlineMarkdown(line)}</p>`);
    }
  }

  closeList();
  return output.join("\n");
}

for (const relativePath of requiredFiles) {
  const candidate = path.join(sourceDirectory, relativePath);
  if (!(await stat(candidate)).isFile()) {
    throw new Error(`Required website file is missing: ${relativePath}`);
  }
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(sourceDirectory, outputDirectory, { recursive: true });
await mkdir(path.join(outputDirectory, "assets"), { recursive: true });
await cp(path.join(codiconsDirectory, "codicon.css"), path.join(outputDirectory, "assets", "codicon.css"));
await cp(path.join(codiconsDirectory, "codicon.ttf"), path.join(outputDirectory, "assets", "codicon.ttf"));

const changelogMarkdown = await readFile(path.join(repositoryRoot, "CHANGELOG.md"), "utf8");
const changelogPath = path.join(outputDirectory, "changelog.html");
const changelogTemplate = await readFile(changelogPath, "utf8");
const marker = "<!-- CHANGELOG_CONTENT -->";
if (!changelogTemplate.includes(marker)) {
  throw new Error("Changelog page is missing its content marker.");
}
await writeFile(changelogPath, changelogTemplate.replace(marker, renderChangelog(changelogMarkdown)));

const outputFiles = await readdir(outputDirectory);
console.log(`Built website with ${outputFiles.length} top-level file(s) in ${outputDirectory}.`);
