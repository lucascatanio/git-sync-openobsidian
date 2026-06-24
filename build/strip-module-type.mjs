// Converts <script type="module" crossorigin> to classic <script> in dist/panel.html.
// Required because the panel runs inside <iframe sandbox="allow-scripts"> without
// allow-same-origin (opaque origin); browsers refuse ES module scripts in that context.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'dist', 'panel.html');

let html = readFileSync(htmlPath, 'utf8');

html = html
  .replace(/<link[^>]*\brel=["']?modulepreload["']?[^>]*>\s*/g, '')
  .replace(/<script\b([^>]*)>/g, (_tag, attrs) => {
    const cleaned = attrs
      .replace(/\s*\btype="module"/g, '')
      .replace(/\s*\bcrossorigin\b/g, '')
      .replace(/\s*\bdefer\b/g, '')
      .trim();
    return cleaned ? `<script defer ${cleaned}>` : '<script defer>';
  });

writeFileSync(htmlPath, html, 'utf8');
console.log('strip-module-type: panel.html patched to classic script');
