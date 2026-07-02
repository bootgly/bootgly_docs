/**
 * Web Worker side of the bootgly-cli terminal engine.
 *
 * PHP-WASM executes here, OFF the main thread: the page keeps painting while a
 * demo runs, so output streams into xterm.js in real time even for CPU-bound
 * demos that never sleep. Chunks flow to the page via postMessage.
 *
 * Protocol (in): { type: 'run', id, command, columns, rows } | { type: 'source', id, command }
 * Protocol (out): { type: 'status'|'output'|'error', id, ... } then { type: 'exit', id, code }
 * or { type: 'source-result', id, source } — errors end with { type: 'fail', id, message }.
 */

import manifest from './bootgly-cli.bundle.json'

// php-wasm's web build touches `document`/`window` at module init (emscripten
// HTML5-event/SDL support the CLI never exercises). Workers have neither, so a
// minimal inert stub is enough to let the runtime boot off the main thread.
if (typeof document === 'undefined') {
  const noop = () => {}
  globalThis.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }),
    addEventListener: noop,
    removeEventListener: noop,
    fullscreenEnabled: false
  }
}
if (typeof window === 'undefined') {
  globalThis.window = globalThis.self
}

const decoder = new TextDecoder()

let bundlePromise = null

function fetchBundle () {
  if (!bundlePromise) {
    bundlePromise = (async () => {
      const [{ unzipSync }, response] = await Promise.all([
        import('fflate'),
        fetch(manifest.asset)
      ])

      if (!response.ok) {
        throw new Error(`Bundle download failed: HTTP ${response.status}`)
      }

      const bytes = new Uint8Array(await response.arrayBuffer())
      return unzipSync(bytes)
    })().catch((err) => {
      bundlePromise = null
      throw err
    })
  }

  return bundlePromise
}

function parseCommand (command) {
  const argv = String(command || '')
    .trim()
    .split(/\s+/)
    .filter((part) => part !== '' && /^[\w@/.:-]+$/.test(part))

  if (argv[0] !== 'bootgly') {
    argv.unshift('bootgly')
  }

  return argv
}

function mountBundle (FS, files) {
  const created = new Set()

  const mkdirs = (dir) => {
    if (!dir || dir === '/' || created.has(dir)) {
      return
    }

    mkdirs(dir.slice(0, dir.lastIndexOf('/')))

    if (!FS.analyzePath(dir).exists) {
      FS.mkdir(dir)
    }
    created.add(dir)
  }

  for (const [path, data] of Object.entries(files)) {
    if (path.endsWith('/')) {
      continue
    }

    const full = `/bootgly/${path}`
    mkdirs(full.slice(0, full.lastIndexOf('/')))
    FS.writeFile(full, data)
  }
}

function buildBootstrap (argv, columns, rows) {
  const args = JSON.stringify(argv)

  return `<?php
putenv('BOOTGLY_SAPI=cli');
putenv('COLUMNS=${Math.max(20, columns | 0)}');
putenv('LINES=${Math.max(5, rows | 0)}');
defined('STDIN')  || define('STDIN',  fopen('php://stdin', 'r'));
defined('STDOUT') || define('STDOUT', fopen('php://stdout', 'w'));
defined('STDERR') || define('STDERR', fopen('php://stderr', 'w'));
$_SERVER['argv'] = json_decode('${args}', true);
$_SERVER['argc'] = count($_SERVER['argv']);
$_SERVER['PWD'] = '/bootgly';
$_SERVER['SCRIPT_FILENAME'] = '/bootgly/bootgly';
chdir('/bootgly');
define('BOOTGLY_WORKING_BASE', '/bootgly');
define('BOOTGLY_WORKING_DIR', '/bootgly/');
require '/bootgly/autoboot.php';
`
}

// One PHP runtime per worker, reused across runs: a fresh PhpWeb per run leaks
// its emscripten heap (php-wasm has no teardown API) and crashes the tab after
// a few executions. `php.refresh()` (pib_refresh) resets the interpreter —
// constants, globals — between runs; the mounted filesystem is re-checked.
let phpPromise = null
let runIndex = 0
let currentId = null

function ensurePhp (post) {
  if (!phpPromise) {
    phpPromise = (async () => {
      post({ type: 'status', phase: 'downloading' })
      const [{ PhpWeb }] = await Promise.all([
        import('php-wasm/PhpWeb.mjs'),
        fetchBundle()
      ])

      post({ type: 'status', phase: 'booting' })
      // No dynamic extensions: they do not survive pib_refresh between runs.
      // Multibyte support comes from Bootgly's pure-PHP mb_* polyfill instead.
      const php = new PhpWeb({
        version: '8.4',
        autoTransaction: false,
        ini: 'output_buffering=0\nimplicit_flush=1\nmemory_limit=256M',
        locateFile: (path) => {
          if (path.endsWith('.wasm') && manifest.wasm) {
            return manifest.wasm
          }

          return undefined
        }
      })

      php.addEventListener('output', (event) => self.postMessage({ type: 'output', id: currentId, chunk: event.detail.join('') }))
      php.addEventListener('error', (event) => self.postMessage({ type: 'error', id: currentId, chunk: event.detail.join('') }))

      await php.binary

      return php
    })().catch((err) => {
      phpPromise = null
      throw err
    })
  }

  return phpPromise
}

async function run (id, command, columns, rows) {
  const post = (message) => self.postMessage({ id, ...message })

  currentId = id
  const php = await ensurePhp(post)
  const files = await fetchBundle()

  // ? Reset the interpreter between runs (constants, globals, request state)
  if (runIndex++ > 0) {
    post({ type: 'status', phase: 'booting' })
    await php.refresh()
  }

  const binary = await php.binary

  post({ type: 'status', phase: 'extracting' })
  if (!binary.FS.analyzePath('/bootgly/autoboot.php').exists) {
    mountBundle(binary.FS, files)
  }

  post({ type: 'status', phase: 'running' })
  // The output buffer only auto-flushes on newlines; a periodic flush keeps
  // partial lines (carriage-return animations) streaming while PHP yields.
  const flusher = setInterval(() => php.flush(), 50)

  try {
    return await php.run(buildBootstrap(parseCommand(command), columns, rows))
  } finally {
    clearInterval(flusher)
    php.flush()
  }
}

async function source (command) {
  const argv = parseCommand(command)
  const id = argv[1] === 'demo' ? argv[2] : null
  const path = id ? manifest.demos[id] : null

  if (!path) {
    return null
  }

  const files = await fetchBundle()
  const data = files[path]

  if (!data) {
    return null
  }

  return {
    text: decoder.decode(data),
    language: 'php',
    url: `https://github.com/bootgly/bootgly/blob/main/${path}`
  }
}

self.addEventListener('message', async (event) => {
  const { type, id, command, columns, rows } = event.data || {}

  try {
    if (type === 'run') {
      const code = await run(id, command, columns, rows)
      self.postMessage({ type: 'exit', id, code })
    } else if (type === 'source') {
      self.postMessage({ type: 'source-result', id, source: await source(command) })
    }
  } catch (err) {
    const detail = err?.stack ? ` :: ${String(err.stack).slice(0, 600)}` : ''
    self.postMessage({ type: 'fail', id, message: (err?.message || String(err)) + detail })
  }
})
