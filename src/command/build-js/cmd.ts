/*
* cmd.ts
*
* Copyright (C) 2021 by RStudio, PBC
*
*/

import { Command } from "cliffy/command/mod.ts";
import { copy } from "fs/copy.ts";

import { esbuildCompile } from "../../core/esbuild.ts";
import { buildSchemaFile } from "../../core/schema/build-schema-file.ts";
import { resourcePath } from "../../core/resources.ts";
import { simple } from "acorn/walk";
import { parse as parseES6 } from "acorn/acorn";

function ensureAllowableIDESyntax(src: string, filename: string) {
  const ast = parseES6(src, {
    ecmaVersion: "2020",
    sourceType: "module",
  });
  let failed = false;
  simple(ast, {
    // deno-lint-ignore no-explicit-any
    ChainExpression(_node: any) {
      console.error(
        `Failure: Chain expression \`?.\` not allowed in ${filename}`,
      );
      failed = true;
    },
    // deno-lint-ignore no-explicit-any
    LogicalExpression(node: any) {
      if (node.operator === "??") {
        console.error(
          `Failure: Nullish coalescing operator \`??\` not allows in ${filename}`,
        );
        failed = true;
      }
    },
  });
  if (failed) {
    throw new Error("Found syntax that is not allowed");
  }
}

async function buildQuartoOJS() {
  const src = await esbuildCompile(
    "",
    resourcePath("formats/html/ojs"),
    ["quarto-ojs.js"],
    "esm",
  );
  await Deno.writeTextFile(resourcePath("build/quarto-ojs.js"), src!);

  ensureAllowableIDESyntax(src!, "quarto-ojs.js");

  // FIXME ideally we'd use the one directly in build, but right now
  // we depend on the file being in a particular place (and with an
  // especially bad name).  We copy for now.
  return copy(
    resourcePath("build/quarto-ojs.js"),
    resourcePath("formats/html/ojs/esbuild-bundle.js"),
    { overwrite: true },
  );
}

async function buildYAMLJS() {
  // convert tree-sitter-yaml to a JSON object that can be imported directly.
  // In principle this never changes so running it every time is overkill, but this
  // way we document the generation of the JSON object.
  // inexplicably, using TextEncoder inside a web worker on QtWebEngine freezes
  // the entire thread. That means we can't use base64 strings to encode the wasm
  // values. So we will encode them as plain js numbers. facepalm
  const treeSitterYamlJson = {
    "data": Array.from(Deno.readFileSync(
      resourcePath("editor/tools/yaml/tree-sitter-yaml.wasm"),
    )),
  };
  Deno.writeTextFileSync(
    resourcePath("editor/tools/yaml/tree-sitter-yaml.json"),
    JSON.stringify(treeSitterYamlJson),
  );

  const esbuild = async (
    cwd: string,
    filename: string,
    outputType: "esm" | "iife" | "cjs" = "iife",
    checkIde = true,
  ) => {
    const result = (await esbuildCompile(
      "",
      cwd,
      [filename],
      outputType,
    ))!;
    if (checkIde) {
      ensureAllowableIDESyntax(result, filename);
    }
    return result;
  };

  Deno.writeTextFileSync(
    resourcePath("editor/tools/yaml/yaml-intelligence.js"),
    await esbuild(
      resourcePath("../core/lib/yaml-intelligence"),
      "ide-main.ts",
      "esm",
    ),
  );

  Deno.writeTextFileSync(
    resourcePath("editor/tools/yaml/yaml.js"),
    await esbuild(
      resourcePath("editor/tools/yaml"),
      "automation.js",
    ),
  );

  const webWorkerSrc = await esbuild(
    resourcePath("../core/lib/yaml-intelligence"),
    "web-worker.ts",
  );
  const vsCodeSrc = await esbuild(
    resourcePath("../core/lib/yaml-intelligence"),
    "vs-code.ts",
    "esm",
    false,
  );

  const treeSitter = Deno.readTextFileSync(
    resourcePath("editor/tools/yaml/tree-sitter.js"),
  );
  ensureAllowableIDESyntax(treeSitter, "tree-sitter.js");

  Deno.writeTextFileSync(
    resourcePath("editor/tools/vs-code.mjs"),
    [treeSitter, vsCodeSrc].join(""),
  );

  Deno.writeTextFileSync(
    resourcePath("editor/tools/yaml/web-worker.js"),
    [treeSitter, webWorkerSrc].join(""),
  );
}

export async function buildAssets() {
  // this has to come first because buildYAMLJS depends on it.
  await buildSchemaFile();

  await Promise.all([
    buildQuartoOJS(),
    buildYAMLJS(),
  ]);
}

export const buildJsCommand = new Command()
  .name("build-js")
  .hidden()
  .description(
    "Builds all the javascript assets necessary for IDE support.\n\n",
  )
  // deno-lint-ignore no-explicit-any
  .action(async (_options: any, _path: string) => {
    await buildAssets();
  });
