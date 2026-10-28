import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const original = readFileSync(resolve(root, 'reference/index.html'), 'utf8');
const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8');
const scene = readFileSync(resolve(root, 'src/scene.js'), 'utf8');
const app = readFileSync(resolve(root, 'src/App.jsx'), 'utf8');
const failures = [];

const originalCssMatch = original.match(/<style>([\s\S]*?)<\/style>/i);
const originalScriptMatch = original.match(/<script type="module">([\s\S]*?)<\/script>/i);
if (!originalCssMatch) failures.push('Could not find the original inline CSS in reference/index.html');
if (!originalScriptMatch) failures.push('Could not find the original module script in reference/index.html');

if (originalCssMatch) {
  const expectedCss = `${originalCssMatch[1].trim()}\n`;
  if (css !== expectedCss) failures.push('src/styles.css differs from the original inline CSS. Review before continuing.');
}

if (originalScriptMatch) {
  const imports = "import * as THREE from 'three';\nimport { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';\nimport { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';\n\n";
  const expectedBody = originalScriptMatch[1].trim().replace(/^import \* as THREE from 'three';\r?\nimport \{ RoomEnvironment \} from 'three\/addons\/environments\/RoomEnvironment\.js';\r?\nimport \{ toCreasedNormals \} from 'three\/addons\/utils\/BufferGeometryUtils\.js';\r?\n\r?\n/, '') + '\n';
  let actualBody = scene.replace(/^import \* as THREE from 'three';\r?\nimport \{ RoomEnvironment \} from 'three\/addons\/environments\/RoomEnvironment\.js';\r?\nimport \{ toCreasedNormals \} from 'three\/addons\/utils\/BufferGeometryUtils\.js';\r?\n\r?\n/, '');
  // Stage 4 may load live menu records before mounting the scene. Normalize that additive data adapter
  // back to the original fallback data when checking that the preserved visual/scene logic is unchanged.
  actualBody = actualBody.replace(/^const API_BASE = .*?\nconst LIVE_MENU_DATA = await fetch\([\s\S]*?\.catch\(\(\) => null\);\n\n/, '');
  actualBody = actualBody.replace('const FALLBACK_CATEGORIES = [', 'const CATEGORIES = [');
  actualBody = actualBody.replace(/\nconst CATEGORIES = LIVE_MENU_DATA \?[\s\S]*?\n\n(?=\/\* =+\n   2\. CONFIG \/ STATE)/, '\n\n');
  actualBody = actualBody.replace('export function mountScene() {\n  const lifecycle = new AbortController();\n  const timers = new Set();\n  let disposed = false;\n  let animationFrame = 0;\n  const listen = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: lifecycle.signal });\n  const later = (handler, delay) => {\n    const timer = setTimeout(() => {\n      timers.delete(timer);\n      if (!disposed) handler();\n    }, delay);\n    timers.add(timer);\n    return timer;\n  };\n\n', '');
  actualBody = actualBody.replace(/\n  return function cleanupScene\(\) \{[\s\S]*?\n  \};\n\}\s*$/, '\n');
  actualBody = actualBody.replaceAll('listen(window, ', 'window.addEventListener(').replaceAll('listen(canvas, ', 'canvas.addEventListener(').replaceAll('listen(b, ', 'b.addEventListener(').replaceAll('later(', 'setTimeout(');
  actualBody = actualBody.replace('function animate(){\n  if (disposed) return;\n  animationFrame = requestAnimationFrame(animate);', 'function animate(){\n  requestAnimationFrame(animate);');
  actualBody = actualBody.replace(']).then(() => {\n  if (disposed) return;\n  buildWall', ']).then(() => {\n  buildWall');
  actualBody = actualBody.replace('// Migrated from the original standalone HTML module. Keep this scene implementation visually unchanged during the first migration phase.\n\n', '');
  actualBody = actualBody.trim() + '\n';
  if (actualBody !== expectedBody) failures.push('Scene logic differs from the preserved original beyond the documented lifecycle wrapper. Review before continuing.');
}

if (!scene.includes('export function mountScene()') || !scene.includes('return function cleanupScene()')) {
  failures.push('Scene lifecycle mount/cleanup functions are missing.');
}
if (!app.includes('cleanupScene?.()')) failures.push('React shell does not call the scene cleanup function on unmount.');
if (!scene.includes('signal: lifecycle.signal')) failures.push('Scene event listeners are not connected to the lifecycle AbortController.');

if (failures.length) {
  console.error('SKY7 parity check FAILED:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('SKY7 parity check passed: CSS and original scene logic match after reversing the documented lifecycle wrapper.');
}
