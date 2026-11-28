// Automated verification suite for EINTER_WEB after English standardization of
// filenames, component exports, relative imports, and API endpoint calls.
// Run with: npm test
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '..', 'src');

function walkFiles(dir, exts) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, exts));
    else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

const SPANISH_NAME_RE =
  /(almacen|articulo|bitacora|categoria|comparativo|concurrencia|contenedor|costos|entrada|etiqueta|factura|fila|hallazgo|historial|inventario|isla(?!nd)|merma|movimiento|orden|pedido|producto|proveedor|reabasto|salida|sesion|tarima|ubicacion|venta)/i;

const LEGACY_API_PREFIX_RE =
  /\/api\/(productos|proveedores|categorias|misc|movimientos|historial|almacen|islas|tarimas|cartones|merma|catalogo|ventas-hd|contenedores|ubicaciones|reabasto|bitacora|facturas|costos-variables)\b/;

const LEGACY_QUERY_PARAM_RE =
  /[?&](anio|mes|dia|categoria|id_ubicacion|id_articulo|id_isla|id_tarima|estado|tipo|codigo|usuario|modulo|desde|hasta|is_active|folio_recibo|modelo|id)=/;

describe('EINTER_WEB filename and export standardization', () => {
  test('all files in src/components and src/pages use English PascalCase filenames', () => {
    for (const folder of ['components', 'pages']) {
      const dir = path.join(SRC_DIR, folder);
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.tsx'));
      assert.ok(files.length > 0, `Expected .tsx files in src/${folder}`);
      for (const file of files) {
        const base = path.parse(file).name;
        assert.match(base, /^[A-Z][A-Za-z0-9]*$/, `src/${folder}/${file} must be PascalCase`);
        assert.ok(!SPANISH_NAME_RE.test(base), `src/${folder}/${file} still contains a Spanish filename`);
      }
    }
  });

  test('every relative import across src/ resolves to an existing file', () => {
    const files = walkFiles(SRC_DIR, ['.ts', '.tsx']);
    const importRe = /from\s+['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"]/g;
    let totalChecked = 0;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      let m;
      while ((m = importRe.exec(content)) !== null) {
        const spec = m[1] ?? m[2];
        const baseTarget = path.resolve(path.dirname(file), spec);
        const candidates = [
          baseTarget,
          `${baseTarget}.ts`,
          `${baseTarget}.tsx`,
          `${baseTarget}.css`,
          path.join(baseTarget, 'index.ts'),
          path.join(baseTarget, 'index.tsx'),
        ];
        assert.ok(
          candidates.some((c) => fs.existsSync(c)),
          `Broken relative import "${spec}" in ${path.relative(SRC_DIR, file)}`
        );
        totalChecked++;
      }
    }
    assert.ok(totalChecked >= 80, `Expected at least 80 relative imports verified, got ${totalChecked}`);
  });

  test('App.tsx wires every page in src/pages/ with its standardized English export', () => {
    const appContent = fs.readFileSync(path.join(SRC_DIR, 'App.tsx'), 'utf8');
    const pageFiles = fs.readdirSync(path.join(SRC_DIR, 'pages')).filter((f) => f.endsWith('.tsx'));

    for (const file of pageFiles) {
      const name = path.parse(file).name;
      assert.ok(
        appContent.includes(`'./pages/${name}'`) || appContent.includes(`"./pages/${name}"`),
        `App.tsx does not import ./pages/${name}`
      );
      const pageContent = fs.readFileSync(path.join(SRC_DIR, 'pages', file), 'utf8');
      assert.ok(
        new RegExp(`export\\s+(default\\s+)?(function|const)\\s+${name}\\b`).test(pageContent),
        `src/pages/${file} should export ${name}`
      );
    }
  });
});

describe('EINTER_WEB API consumer continuity', () => {
  test('no legacy Spanish endpoints, /(api)/ prefixes, or legacy query params remain in src/', () => {
    const files = walkFiles(SRC_DIR, ['.ts', '.tsx']);
    let apiCallsFound = 0;

    for (const file of files) {
      const rel = path.relative(SRC_DIR, file);
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

        if (line.includes('/api/')) apiCallsFound++;
        if (rel !== path.join('lib', 'fetch.ts')) {
          assert.ok(!line.includes('/(api)/'), `${rel}:${i + 1} still uses legacy /(api)/ prefix`);
        }
        assert.ok(
          !LEGACY_API_PREFIX_RE.test(line),
          `${rel}:${i + 1} still calls a legacy Spanish endpoint: ${trimmed}`
        );
        assert.ok(
          !LEGACY_QUERY_PARAM_RE.test(line),
          `${rel}:${i + 1} still uses a legacy/Spanish query param: ${trimmed}`
        );
      }
    }

    assert.ok(apiCallsFound >= 60, `Expected at least 60 API calls in EINTER_WEB, found ${apiCallsFound}`);
  });
});
