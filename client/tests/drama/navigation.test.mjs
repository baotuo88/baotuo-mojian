import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

const require = createRequire(import.meta.url);
const module = { exports: {} };
const source = fs.readFileSync(new URL("../../src/components/layout/Sidebar.tsx", import.meta.url), "utf8");
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module, exports: module.exports,
  require(id) {
    if (id === "@tanstack/react-query") return { useQuery: () => ({}) };
    if (id === "@/api/queryKeys") return { queryKeys: {
      tasks: { overview: [] }, knowledge: { documents: () => [] }, autoDirectorFollowUps: { overview: [] },
    } };
    if (id.startsWith("@/api/")) return {};
    if (id === "@/components/ui/button") return { Button: ({ children, variant, size, ...props }) => createElement("button", props, children) };
    if (id === "@/components/ui/badge") return { Badge: ({ children }) => createElement("span", null, children) };
    if (id === "@/components/visualAssets") return { VisualAssetLibraryDialog: () => null };
    if (id === "@/lib/utils") return { cn: (...values) => values.filter((value) => typeof value === "string").join(" ") };
    return require(id);
  },
});

for (const collapsed of [false, true]) {
  test(`desktop navigation opens the short drama workspace when ${collapsed ? "collapsed" : "expanded"}`, () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/"] },
      createElement(module.exports.default, { collapsed, onToggle() {} })));
    const link = html.match(/<a\b[^>]*href="\/drama"[^>]*>[\s\S]*?<\/a>/)?.[0];
    assert.ok(link, "短剧工作台必须渲染为指向 /drama 的可点击链接");
    assert.match(link, /短剧工作台/);
    assert.doesNotMatch(link, /即将推出|cursor-not-allowed/);
  });
}
