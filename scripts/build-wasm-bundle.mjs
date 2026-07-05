#!/usr/bin/env node
/**
 * Builds the Bootgly CLI WASM bundle consumed by the `bootgly-cli` terminal engine.
 *
 * Reads the sibling framework repository (override with BOOTGLY_SRC), packs the
 * files needed to boot `bootgly demo N` inside php-wasm into a zip served as a
 * static asset, and emits a manifest with the demo id → file map parsed from
 * DemoCommand.php. It also copies the PHP 8.4 .wasm binary from the php-wasm
 * package into public/wasm/ so the emscripten glue can fetch it same-origin.
 *
 * The zip and manifest are committed: Cloudflare Pages builds this repository
 * alone, without the sibling framework checkout — when the source is absent the
 * script warns and exits 0 so predev/prebuild keep working there.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bootglyRoot = resolve(process.env.BOOTGLY_SRC || join(projectRoot, '..', 'bootgly'))

const zipPath = join(projectRoot, 'public', 'wasm', 'bootgly-cli.zip')
const manifestPath = join(projectRoot, 'src', 'terminals', 'bootgly-cli.bundle.json')
const wasmDir = join(projectRoot, 'public', 'wasm')

if (!existsSync(join(bootglyRoot, 'autoboot.php'))) {
  console.warn(`[wasm:bundle] Bootgly source not found at ${bootglyRoot} — skipping (using committed bundle).`)
  process.exit(0)
}

// Files and directory roots included in the bundle, relative to the bootgly root.
const INCLUDE_FILES = [
  'bootgly',
  'autoboot.php',
  'Bootgly.php',
  'Bootgly/autoload.php',
  'Bootgly/CLI.php',
  'Bootgly/WPI.php',
  'Bootgly/WPI/autoload.php',
  'Bootgly/ADI/autoload.php',
  'Bootgly/ADI/Table.php',
  'scripts/@.php'
]

const INCLUDE_DIRS = [
  'Bootgly/ABI',
  'Bootgly/ACI',
  'Bootgly/ADI/Table',
  'Bootgly/API',
  'Bootgly/CLI',
  'Bootgly/commands',
  'projects/Demo/CLI'
]

// Path segments excluded everywhere: test resources, vendored comparisons, staging dirs.
const EXCLUDED_SEGMENTS = new Set(['tests', 'vs', '&', 'node_modules', '.git'])

const collect = (root) => {
  const files = []

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED_SEGMENTS.has(entry.name)) {
        continue
      }

      const path = join(dir, entry.name)

      if (entry.isDirectory()) {
        walk(path)
        continue
      }

      if (!entry.isFile() || entry.name.endsWith('.md')) {
        continue
      }

      files.push(path)
    }
  }

  walk(root)

  return files
}

const entries = new Map()

for (const file of INCLUDE_FILES) {
  const path = join(bootglyRoot, file)
  if (existsSync(path)) {
    entries.set(file.replaceAll('\\', '/'), readFileSync(path))
  } else {
    console.warn(`[wasm:bundle] Missing include: ${file}`)
  }
}

for (const dir of INCLUDE_DIRS) {
  const root = join(bootglyRoot, dir)
  if (!existsSync(root)) {
    console.warn(`[wasm:bundle] Missing include dir: ${dir}`)
    continue
  }

  for (const file of collect(root)) {
    entries.set(relative(bootglyRoot, file).replaceAll('\\', '/'), readFileSync(file))
  }
}

// Console platform (sibling repo, override with BOOTGLY_CONSOLE_SRC): mounted
// under /bootgly/Console/ (mirrors the kit submodule layout) plus its exportable
// game projects and registry under /bootgly/projects/ (the `project start`
// allow-list — the framework's own registry is not bundled, so no collision).
const consoleRoot = resolve(process.env.BOOTGLY_CONSOLE_SRC || join(projectRoot, '..', 'bootgly-console'))
let games = 0

if (existsSync(join(consoleRoot, 'autoboot.php'))) {
  for (const file of ['autoboot.php', 'Console.php']) {
    entries.set(`Console/${file}`, readFileSync(join(consoleRoot, file)))
  }

  for (const file of collect(join(consoleRoot, 'Console'))) {
    entries.set(`Console/${relative(consoleRoot, file).replaceAll('\\', '/')}`, readFileSync(file))
  }

  entries.set('projects/Bootgly.projects.php', readFileSync(join(consoleRoot, 'projects', 'Bootgly.projects.php')))

  for (const entry of readdirSync(join(consoleRoot, 'projects'), { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }

    for (const file of collect(join(consoleRoot, 'projects', entry.name))) {
      entries.set(relative(consoleRoot, file).replaceAll('\\', '/'), readFileSync(file))
    }
    games++
  }
} else {
  console.warn(`[wasm:bundle] Console platform source not found at ${consoleRoot} — bundling without games.`)
}

// Parse BOOTGLY_VERSION from autoboot.php.
const autoboot = readFileSync(join(bootglyRoot, 'autoboot.php'), 'utf8')
const version = autoboot.match(/define\('BOOTGLY_VERSION',\s*'([^']+)'\)/)?.[1] ?? 'unknown'

// Parse the demo id → file map from DemoCommand.php ($examples array).
const demoCommand = readFileSync(join(bootglyRoot, 'Bootgly/commands/DemoCommand.php'), 'utf8')
const examplesBlock = demoCommand.match(/\$examples\s*=\s*\[([\s\S]*?)\];/)?.[1] ?? ''
const demos = {}
for (const match of examplesBlock.matchAll(/(\d+)\s*=>\s*'([^']+)'/g)) {
  demos[match[1]] = `projects/Demo/CLI/${match[2]}`
}

// Copy the PHP 8.4 wasm binary referenced by php-wasm's web glue.
const phpWasmDir = join(projectRoot, 'node_modules', 'php-wasm')
const glue = readFileSync(join(phpWasmDir, 'php8.4-web.mjs'), 'utf8')
const wasmFile = glue.match(/"([a-f0-9]{40}\.wasm)"/)?.[1]
if (wasmFile) {
  mkdirSync(wasmDir, { recursive: true })
  writeFileSync(join(wasmDir, wasmFile), readFileSync(join(phpWasmDir, wasmFile)))
} else {
  console.warn('[wasm:bundle] Could not locate the PHP 8.4 .wasm binary in php-wasm.')
}

// No dynamic extensions are shipped: loading .so files does not survive
// pib_refresh between runs, so multibyte support relies on Bootgly's pure-PHP
// mb_* polyfill (ABI/autoload.php) instead.

const zipped = zipSync(Object.fromEntries(entries), { level: 9 })

mkdirSync(dirname(zipPath), { recursive: true })
writeFileSync(zipPath, zipped)

const manifest = {
  asset: '/wasm/bootgly-cli.zip',
  version,
  wasm: wasmFile ? `/wasm/${wasmFile}` : '',
  files: entries.size,
  bytes: zipped.byteLength,
  demos
}

mkdirSync(dirname(manifestPath), { recursive: true })
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

const raw = [...entries.values()].reduce((total, buffer) => total + buffer.byteLength, 0)
console.log(`[wasm:bundle] ${entries.size} files, ${(raw / 1048576).toFixed(1)} MB raw → ${(zipped.byteLength / 1048576).toFixed(2)} MB zip (Bootgly ${version}, ${Object.keys(demos).length} demos, ${games} games)`)
