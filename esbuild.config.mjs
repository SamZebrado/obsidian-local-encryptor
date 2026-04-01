import esbuild from "esbuild";
import process from "node:process";
import { builtinModules } from "node:module";

const production = process.argv.includes("production");
const watch = !production;

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    ...builtinModules
  ],
  format: "cjs",
  target: "es2022",
  sourcemap: production ? false : "inline",
  minify: production,
  outfile: "main.js",
  platform: "node",
  logLevel: "info"
});

if (watch) {
  await context.watch();
  console.log("Watching for changes...");
} else {
  await context.rebuild();
  await context.dispose();
}
