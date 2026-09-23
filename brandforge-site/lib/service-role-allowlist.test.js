// H7 mitigation: the service-role client (lib/supabase/admin.ts) bypasses RLS
// entirely. Until the privileged actions move into SECURITY DEFINER functions,
// exactly one module may import it. This test fails CI if anything else does.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The only file allowed to import the service-role client.
const ALLOWED_IMPORTERS = new Set(['lib/project-db.ts']);

// Matches real ES imports of the admin client, not mentions in comments.
const IMPORT_PATTERN = /from\s+['"]@\/lib\/supabase\/admin['"]/;

function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.endsWith('.test.js')) {
      results.push(full);
    }
  }
  return results;
}

test('only allow-listed modules import the service-role client', () => {
  const root = process.cwd();
  const files = ['app', 'components', 'lib'].flatMap((dir) =>
    walk(path.join(root, dir))
  );

  const importers = files
    .filter((file) => IMPORT_PATTERN.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(root, file).split(path.sep).join('/'));

  for (const importer of importers) {
    assert.ok(
      ALLOWED_IMPORTERS.has(importer),
      `${importer} imports the service-role client but is not allow-listed (H7)`
    );
  }

  // Belt and braces: no route handler or component may import it directly.
  const forbidden = importers.filter(
    (file) => file.startsWith('app/') || file.startsWith('components/')
  );
  assert.deepEqual(forbidden, []);
});
