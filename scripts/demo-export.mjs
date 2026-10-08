/**
 * Export a self-contained demo that opens directly from disk, without a server.
 * Run: node scripts/demo-export.mjs [download-directory]
 * The normal Vite site build and original game's files are left untouched.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const downloadDirectory = process.argv[2] ? resolve(process.argv[2]) : undefined;
const result = await build({
  root,
  configFile: false,
  publicDir: false,
  base: './',
  logLevel: 'warn',
  build: {
    write: false,
    emptyOutDir: false,
    target: 'es2020',
    sourcemap: false,
    minify: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(root, 'src/demo/main.ts'),
      name: 'QingxiDemo',
      formats: ['iife'],
      fileName: 'qingxi-demo',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

const outputs = (Array.isArray(result) ? result : [result]).flatMap(r => r.output);
const chunks = outputs.filter(output => output.type === 'chunk');
const styles = outputs.filter(output => output.type === 'asset' && output.fileName.endsWith('.css'));
const extraAssets = outputs.filter(output => output.type === 'asset' && !output.fileName.endsWith('.css'));
if (chunks.length !== 1 || !styles.length || extraAssets.length) {
  throw new Error('Single-file export expected one script, CSS and no external asset files.');
}
if (chunks[0].imports.length || chunks[0].dynamicImports.length) {
  throw new Error('The demo still imports another script; refusing to export an incomplete file.');
}

const harbor = await readFile(resolve(root, 'public/demo/harbor.webp'));
const image = `data:image/webp;base64,${harbor.toString('base64')}`;
let code = chunks[0].code;
if (!code.includes('./demo/harbor.webp') || !code.includes('href="./index.html"')) {
  throw new Error('The demo resource paths changed; update the single-file replacements before exporting.');
}
code = code.replaceAll('./demo/harbor.webp', image).replaceAll('href="./index.html"', 'href="#"');
// A literal closing script tag inside a JS string must not end this HTML element.
code = code.replace(/<\/script/gi, '<\\/script');
const css = styles.map(asset => typeof asset.source === 'string'
  ? asset.source : Buffer.from(asset.source).toString('utf8')).join('\n')
  + '\na.rail-link{display:none!important}';
if (/url\(\s*['"]?(?!data:|#)[^\s'"\)]/i.test(css) || /@import\b/i.test(css)) {
  throw new Error('The demo stylesheet still loads an external resource.');
}
const template = await readFile(resolve(root, 'demo.html'), 'utf8');
const entry = '<script type="module" src="/src/demo/main.ts"></script>';
if (!template.includes(entry)) throw new Error('The demo HTML entry changed; update the export template.');
const html = template
  .replace('</head>', `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>\n</head>`)
  .replace(entry, () => `<script>${code}</script>`);

const distribution = resolve(root, 'dist/qingxi-demo.html');
await mkdir(dirname(distribution), { recursive: true });
await writeFile(distribution, html, 'utf8');
console.log(`Single-file demo: ${distribution}`);
if (downloadDirectory) {
  const download = resolve(downloadDirectory, '青溪试游.html');
  await mkdir(downloadDirectory, { recursive: true });
  await writeFile(download, html, 'utf8');
  console.log(`Download copy: ${download}`);
}
console.log(`Size: ${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB; scripts, CSS and illustration embedded.`);
