import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const standaloneServer = path.join(standaloneRoot, "server.js");

await access(standaloneServer);
await mkdir(path.join(standaloneRoot, ".next"), { recursive: true });

await copyBuildAsset("public", path.join(standaloneRoot, "public"));
await copyBuildAsset(path.join(".next", "static"), path.join(standaloneRoot, ".next", "static"));

console.log("Prepared the standalone server with public and static assets.");

async function copyBuildAsset(sourcePath, destinationPath) {
  const source = path.join(projectRoot, sourcePath);
  await access(source);
  await rm(destinationPath, { recursive: true, force: true });
  await cp(source, destinationPath, { recursive: true });
}
