import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

async function fixImports() {
  for await (const file of walk('src')) {
    if (!file.endsWith('.ts')) continue;
    
    let content = await readFile(file, 'utf-8');
    const original = content;
    
    // Fix relative imports
    content = content.replace(
      /from\s+['"](\.\.[\/\\][^'"]*|\.\/[^'"]*)['"]/g,
      (match, path) => {
        if (path.endsWith('.js')) return match;
        return match.replace(path, path + '.js');
      }
    );
    
    if (content !== original) {
      await writeFile(file, content);
      console.log(`Fixed: ${file}`);
    }
  }
}

fixImports().catch(console.error);
