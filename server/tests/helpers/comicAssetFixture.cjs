const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createRequire } = require('node:module');

function sourceLoader(stubs) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename);
    const exp = {};
    cache.set(filename, exp);
    const localRequire = createRequire(filename);
    const context = {
      exports: exp, Buffer, console, process, setTimeout, clearTimeout, AbortSignal, AbortController,
      require(id) {
        if (Object.hasOwn(stubs, id)) return stubs[id];
        if (!id.startsWith('.')) return localRequire(id);
        const resolved = path.resolve(path.dirname(filename), id);
        for (const [suffix, value] of Object.entries(stubs)) {
          if (resolved.endsWith(suffix)) return value;
        }
        for (const candidate of [resolved + '.ts', path.join(resolved, 'index.ts')]) {
          if (fs.existsSync(candidate)) return load(candidate);
        }
        return localRequire(id);
      },
    };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, context, { filename });
    return exp;
  }
  return load;
}
module.exports = { sourceLoader };
