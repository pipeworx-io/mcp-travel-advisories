interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * US Travel Advisories MCP.
 *
 * Current US State Department travel advisories for ~200 countries, from the
 * official travel.state.gov RSS feed. Keyless. Each country has a threat level
 * 1–4 (1 = exercise normal precautions … 4 = do not travel). Useful for "is it
 * safe to travel to X" questions. Parsed + normalized in-pack.
 */


const FEED = 'https://travel.state.gov/_res/rss/TAsTWs.xml';
const UA = 'pipeworx-mcp-travel-advisories/1.0 (+https://pipeworx.io)';

const LEVEL_LABEL: Record<number, string> = {
  1: 'Exercise Normal Precautions',
  2: 'Exercise Increased Caution',
  3: 'Reconsider Travel',
  4: 'Do Not Travel',
};

const tools: McpToolExport['tools'] = [
  {
    name: 'advisories',
    description:
      'List current US State Department travel advisories. Filter by country keyword and/or minimum threat level (1=normal precautions, 2=increased caution, 3=reconsider travel, 4=do not travel). Sorted by threat level (highest first).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Country name filter, e.g. "mexico", "france".' },
        level: { type: 'number', description: 'Exact threat level to filter (1-4).' },
        min_level: { type: 'number', description: 'Minimum threat level (e.g. 3 → only "reconsider travel" and "do not travel").' },
        limit: { type: 'number', description: 'Max advisories to return (1-250, default 50).' },
      },
    },
  },
  {
    name: 'advisory',
    description: 'Get the current US travel advisory for a single country. Pass the country NAME (recommended), e.g. "Japan", "Mexico". A State Department 2-letter country code also works (note: these are NOT ISO codes — e.g. Japan is "JA").',
    inputSchema: {
      type: 'object',
      properties: { country: { type: 'string', description: 'Country name (recommended), e.g. "Mexico". Partial names match.' } },
      required: ['country'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const list = parseFeed(await fetchFeed());
  switch (name) {
    case 'advisories':
      return listAdvisories(list, args);
    case 'advisory':
      return getAdvisory(list, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function fetchFeed(): Promise<string> {
  const res = await fetch(FEED, { headers: { Accept: 'application/xml, text/xml', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Travel advisories: HTTP ${res.status}`);
  return res.text();
}

function listAdvisories(list: Advisory[], args: Record<string, unknown>): unknown {
  const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
  const level = numOrNull(args.level);
  const minLevel = numOrNull(args.min_level);
  const limit = clamp(numArg(args.limit, 50), 1, 250);

  let out = list.filter((a) => {
    if (q && !a.country.toLowerCase().includes(q)) return false;
    if (level !== null && a.level !== level) return false;
    if (minLevel !== null && a.level < minLevel) return false;
    return true;
  });
  out.sort((a, b) => b.level - a.level || a.country.localeCompare(b.country));

  return {
    source: 'travel.state.gov',
    total_matching: out.length,
    count: Math.min(out.length, limit),
    advisories: out.slice(0, limit),
  };
}

function getAdvisory(list: Advisory[], args: Record<string, unknown>): unknown {
  const c = String(args.country ?? '').trim().toLowerCase();
  if (!c) throw new Error('Pass a `country` name or ISO-2 code.');
  const hit = list.find((a) => a.country_code.toLowerCase() === c) || list.find((a) => a.country.toLowerCase() === c) || list.find((a) => a.country.toLowerCase().includes(c));
  if (!hit) throw new Error(`No travel advisory found for "${args.country}".`);
  return hit;
}

interface Advisory {
  country: string;
  country_code: string;
  level: number;
  level_label: string;
  summary: string;
  updated: string;
  url: string;
}

function parseFeed(xml: string): Advisory[] {
  const out: Advisory[] = [];
  for (const it of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const title = tag(it, 'title');
    const threat = cat(it, 'Threat-Level'); // "Level 2: Exercise Increased Caution"
    const level = Number((threat.match(/Level\s*(\d)/) ?? [])[1]) || levelFromTitle(title);
    const country = title.replace(/\s*-\s*Level\s*\d.*$/i, '').trim();
    out.push({
      country: country || title,
      country_code: cat(it, 'Country-Tag').trim().toUpperCase(),
      level: level || 0,
      level_label: LEVEL_LABEL[level] ?? threat.replace(/^Level\s*\d:\s*/i, '').trim(),
      summary: tag(it, 'description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600),
      updated: tag(it, 'pubDate').trim(),
      url: tag(it, 'link').trim(),
    });
  }
  return out;
}

function levelFromTitle(title: string): number {
  return Number((title.match(/Level\s*(\d)/) ?? [])[1]) || 0;
}
function cat(xml: string, domain: string): string {
  const m = xml.match(new RegExp(`<category[^>]*domain="${domain}"[^>]*>([\\s\\S]*?)<\\/category>`, 'i'));
  return m ? decode(unwrap(m[1])) : '';
}
function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`));
  return m ? decode(unwrap(m[1])) : '';
}
function unwrap(s: string): string {
  const m = s.trim().match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return (m ? m[1] : s).trim();
}
function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function numOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
function numArg(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : dflt;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
