/**
 * Bootgly CLI terminal engine — runs real `bootgly demo N` commands on PHP 8.4
 * compiled to WebAssembly (php-wasm), streaming ANSI output into the
 * `<d-block-terminal>` block.
 *
 * Execution happens inside a Web Worker (see bootgly-cli.worker.js): the main
 * thread stays free, so the terminal paints in real time even while PHP runs
 * CPU-bound code. This module is only the message bridge implementing the
 * Docsector terminal-engine contract.
 */

export const meta = {
  label: 'Bootgly CLI (PHP WASM)',
  language: 'php'
}

export default async function createEngine ({ onOutput, onError, onStatus }) {
  let worker = null
  let requestIndex = 0
  const pending = new Map()

  const ensureWorker = () => {
    if (worker) {
      return worker
    }

    worker = new Worker(new URL('./bootgly-cli.worker.js', import.meta.url), { type: 'module' })

    worker.addEventListener('message', (event) => {
      const { type, id, chunk, phase, code, source, message } = event.data || {}
      const request = pending.get(id)

      if (type === 'output') {
        onOutput(chunk)
      } else if (type === 'error') {
        onError(chunk)
      } else if (type === 'status') {
        onStatus(phase)
      } else if (type === 'exit' && request) {
        pending.delete(id)
        request.resolve(code)
      } else if (type === 'source-result' && request) {
        pending.delete(id)
        request.resolve(source)
      } else if (type === 'fail' && request) {
        pending.delete(id)
        request.reject(new Error(message))
      }
    })

    worker.addEventListener('error', (event) => {
      const failure = new Error(event.message || 'Terminal worker crashed.')
      for (const request of pending.values()) {
        request.reject(failure)
      }
      pending.clear()
      worker.terminate()
      worker = null
    })

    return worker
  }

  const request = (message) => new Promise((resolve, reject) => {
    const id = ++requestIndex
    pending.set(id, { resolve, reject, type: message.type })
    ensureWorker().postMessage({ ...message, id })
  })

  return {
    async run (command, { columns = 80, rows = 24 } = {}) {
      return request({ type: 'run', command, columns, rows })
    },

    // Keyboard/mouse data typed into the terminal — queued into the PHP stdin
    // buffer; Bootgly reads it as an emulated TTY (BOOTGLY_TTY=1).
    input (data) {
      worker?.postMessage({ type: 'input', data })
    },

    // Stopping kills the worker: PHP dies instantly, mid-instruction. The next
    // run spawns a fresh worker (the bundle re-fetch hits the HTTP cache).
    async stop () {
      if (!worker) {
        return
      }

      worker.terminate()
      worker = null

      onOutput('\r\n\x1b[31m^C\x1b[0m\r\n')
      for (const request of pending.values()) {
        request.resolve(request.type === 'run' ? 130 : null)
      }
      pending.clear()
    },

    async source (command) {
      return request({ type: 'source', command })
    },

    async dispose () {
      worker?.terminate()
      worker = null
      pending.clear()
    }
  }
}
