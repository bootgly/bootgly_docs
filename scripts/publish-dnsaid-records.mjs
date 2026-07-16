#!/usr/bin/env node
/**
 * Publishes the DNS for AI Discovery (DNS-AID) records for the Bootgly docs site.
 *
 * DNS-AID (draft-mozleywilliams-dnsop-dnsaid-02) advertises AI agents in the DNS
 * through ServiceMode SVCB records under the `_agents` namespace. Scanners such as
 * isitagentready.com resolve, for the scanned host, the well-known entry points
 * `_index._agents.<host>` / `_mcp._agents.<host>` / `_a2a._agents.<host>` over DoH
 * (with the DNSSEC DO bit set) and expect at least one ServiceMode answer.
 *
 * Records published in the `bootgly.com` Cloudflare zone (already DNSSEC-signed,
 * so Cloudflare signs these automatically — validating resolvers return AD=1):
 *
 *   _index._agents.docs.bootgly.com. 3600 IN SVCB 1 docs.bootgly.com. alpn="h2" port="443"
 *   _mcp._agents.docs.bootgly.com.   3600 IN SVCB 1 docs.bootgly.com. alpn="h2" port="443"
 *   _index._agents.bootgly.com.      3600 IN SVCB 1 bootgly.com.      alpn="h2" port="443"
 *   _mcp._agents.bootgly.com.        3600 IN SVCB 1 docs.bootgly.com. alpn="h2" port="443"
 *
 * The two apex records were already live (and validated: the isitagentready scan of
 * https://bootgly.com reports dnsAid pass, dnssecValidated, validServiceMode) — the
 * docs records reuse the exact same shape. The `_index` records are the organization
 * entry point (draft §3.2 — ServiceMode, TargetName without underscores). The `_mcp`
 * records advertise the MCP agent served by this repository at
 * https://docs.bootgly.com/mcp (functions/mcp.js); the agent protocol is identified
 * by the `_mcp` DNS-SD label, the alpn carries the transport. No `_a2a` records are
 * published: Bootgly exposes no Agent-to-Agent endpoint.
 *
 * Usage:
 *   node scripts/publish-dnsaid-records.mjs --dry-run   # print the plan, no network
 *   node scripts/publish-dnsaid-records.mjs             # create/update via Cloudflare API
 *   node scripts/publish-dnsaid-records.mjs --verify    # resolve via DoH and check AD/answers
 *
 * Publishing needs CLOUDFLARE_API_TOKEN with "Zone.DNS Edit" on bootgly.com
 * (dash.cloudflare.com → My Profile → API Tokens → Create Token → "Edit zone DNS").
 * CLOUDFLARE_ZONE_ID skips the zone lookup when the token cannot list zones.
 * Without a token the same four records can be added in the dashboard (DNS → Records
 * → Add record → type SVCB) using the name/priority/target/value printed by --dry-run.
 */

const ZONE_NAME = 'bootgly.com'
const API = 'https://api.cloudflare.com/client/v4'
const DOH = 'https://cloudflare-dns.com/dns-query'
const TTL = 3600

const RECORDS = [
  {
    name: '_index._agents.docs.bootgly.com',
    data: { priority: 1, target: 'docs.bootgly.com', value: 'alpn="h2" port="443"' },
    comment: 'DNS-AID organization index (docs site)'
  },
  {
    name: '_mcp._agents.docs.bootgly.com',
    data: { priority: 1, target: 'docs.bootgly.com', value: 'alpn="h2" port="443"' },
    comment: 'DNS-AID MCP agent — https://docs.bootgly.com/mcp'
  },
  {
    name: '_index._agents.bootgly.com',
    data: { priority: 1, target: 'bootgly.com', value: 'alpn="h2" port="443"' },
    comment: 'DNS-AID organization index'
  },
  {
    name: '_mcp._agents.bootgly.com',
    data: { priority: 1, target: 'docs.bootgly.com', value: 'alpn="h2" port="443"' },
    comment: 'DNS-AID MCP agent — https://docs.bootgly.com/mcp'
  }
]

const mode = process.argv.includes('--dry-run')
  ? 'dry-run'
  : process.argv.includes('--verify') ? 'verify' : 'publish'

function presentation ({ name, data }) {
  return `${name}. ${TTL} IN SVCB ${data.priority} ${data.target}. ${data.value}`
}

if (mode === 'dry-run') {
  console.log('[dnsaid] Records to publish in the Cloudflare zone', `"${ZONE_NAME}":\n`)
  for (const record of RECORDS) console.log(`  ${presentation(record)}`)
  console.log('\n[dnsaid] Dashboard equivalent (DNS → Records → Add record, type SVCB):')
  for (const { name, data } of RECORDS) {
    console.log(`  name: ${name}  priority: ${data.priority}  target: ${data.target}  value: ${data.value}`)
  }
  process.exit(0)
}

if (mode === 'verify') {
  let failures = 0
  for (const record of RECORDS) {
    const url = `${DOH}?name=${record.name}&type=SVCB&do=1`
    const response = await fetch(url, { headers: { Accept: 'application/dns-json' } })
    const result = await response.json()
    const answers = (result.Answer || []).filter(answer => answer.type === 64)
    const status = answers.length > 0 ? 'OK ' : 'MISSING'
    if (answers.length === 0) failures++
    console.log(`[dnsaid] ${status} AD=${result.AD} ${record.name}`)
    for (const answer of answers) console.log(`         ${answer.data}`)
  }
  console.log(failures === 0
    ? '[dnsaid] All records resolve. Re-scan: curl -s -X POST https://isitagentready.com/api/scan -H "Content-Type: application/json" -d \'{"url":"https://docs.bootgly.com"}\''
    : `[dnsaid] ${failures} record(s) missing — publish them first (see --dry-run).`)
  process.exit(failures === 0 ? 0 : 1)
}

// @ publish
const token = process.env.CLOUDFLARE_API_TOKEN
if (!token) {
  console.error('[dnsaid] CLOUDFLARE_API_TOKEN is not set — create a "Edit zone DNS" token')
  console.error(`[dnsaid] scoped to ${ZONE_NAME} (dash.cloudflare.com → My Profile → API Tokens),`)
  console.error('[dnsaid] or add the records manually with the values from --dry-run.')
  process.exit(1)
}

async function cloudflare (method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  const result = await response.json()
  if (!result.success) {
    const messages = (result.errors || []).map(error => `${error.code}: ${error.message}`).join('; ')
    throw new Error(`${method} ${path} failed — ${messages || response.status}`)
  }
  return result.result
}

let zoneId = process.env.CLOUDFLARE_ZONE_ID
if (!zoneId) {
  const zones = await cloudflare('GET', `/zones?name=${ZONE_NAME}`)
  if (!zones[0]) {
    console.error(`[dnsaid] Zone "${ZONE_NAME}" not visible to this token — set CLOUDFLARE_ZONE_ID.`)
    process.exit(1)
  }
  zoneId = zones[0].id
}

for (const record of RECORDS) {
  const payload = { type: 'SVCB', name: record.name, ttl: TTL, data: record.data, comment: record.comment }
  const existing = await cloudflare('GET', `/zones/${zoneId}/dns_records?type=SVCB&name=${record.name}`)
  const current = existing[0]

  if (!current) {
    await cloudflare('POST', `/zones/${zoneId}/dns_records`, payload)
    console.log(`[dnsaid] created  ${presentation(record)}`)
    continue
  }

  // ? SvcParam presentation may differ cosmetically (quoting, order) between the API
  //   and the dashboard — compare a canonical form so cosmetic diffs do not rewrite
  const canonical = value => (value || '').replace(/"/g, '').trim().split(/\s+/).sort().join(' ')
  const unchanged = current.data?.priority === record.data.priority &&
    current.data?.target?.replace(/\.$/, '') === record.data.target &&
    canonical(current.data?.value) === canonical(record.data.value)
  if (unchanged) {
    console.log(`[dnsaid] kept     ${presentation(record)}`)
    continue
  }

  await cloudflare('PUT', `/zones/${zoneId}/dns_records/${current.id}`, payload)
  console.log(`[dnsaid] updated  ${presentation(record)}`)
}

console.log('[dnsaid] Done. Confirm with: node scripts/publish-dnsaid-records.mjs --verify')
