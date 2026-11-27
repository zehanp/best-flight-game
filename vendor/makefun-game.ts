// make.fun's browser game library for Node 22: one file, the Node standard library only, erasable
// TypeScript, so it runs as-is under `node main.ts` with no flags, no build and no install. Copy it to
// vendor/makefun-game.ts in your repository (a copy anywhere else counts as lines you wrote) and import it:
//
//   import { buildDossier } from './vendor/makefun-game.ts';
//   writeFileSync('/output/dossier.json', buildDossier('/output', {
//     text_max_bytes: 163840,
//     screenshots: { max: 4, max_bytes: 262144 },
//     game_max_files: 993,
//     game_max_bytes: 50331648,
//   }));
//
// The bounty's scorer runs this same file, byte for byte, on what you hand in, and requires your
// dossier.json to equal what buildDossier writes from your game/ and screenshots/.
//
//   readGameTree(dir, caps)     every file and directory under game/, by path with its bytes and its class
//                               (source, vendored or asset) and the totals; caps (each optional) bound how
//                               many entries it holds, how many bytes and how long a path may be
//   classifyGamePath(path)      'source', 'vendored' or 'asset', by the bounty's source rule: a file under
//                               game/ with a source extension, not under a directory named vendor and not
//                               named *.min.js/*.min.mjs/*.min.css
//   htmlFacts(html)             a page's <script>, <link>, <img>, <source>, <video>, <audio> and <iframe>
//                               tags and its <script type="importmap"> blocks, in document order, attributes parsed
//   importMapOf(facts)          the page's import map, parsed (imports and scopes, a null value allowed): none when
//                               the page has none (an import map is optional), or why one it has cannot be used
//   isRelativeRef(ref)          whether a reference is relative: no scheme, no leading // and no leading /
//   isRelativeSpecifier(name)   whether a module specifier is relative in JavaScript's sense (./ or ../): a bare
//                               name such as "phaser" is not, whatever the import map then makes of it
//   resolveGamePath(ref, from)  the path under game/ a relative reference names, from the importing file's
//                               path; null when the reference is not relative or climbs out of game/
//   importMapMatch(map, name, from)
//                               what an import map says for a bare specifier imported from `from`: the scoped or
//                               top-level entry, found false when neither maps it, or value null when a null entry
//                               blocks it
//   mappedSpecifier(map, name, from)
//                               the value an import map gives a bare specifier: an exact key, else the longest key
//                               ending in / that prefixes it, a matching scope's map first; null when none or blocked
//   sourceImports(text)         a module's static import and export-from specifiers, in source order, by a
//                               lexical scan (the gate's own check parses the module, see below)
//   importOrder(sources, facts) the source scripts in the order the page loads them: index.html's scripts in
//                               document order, a classic <script src> in document order, a module script (inline
//                               or src) followed by a depth-first walk of its static imports, specifiers resolved
//                               relative to the importer or through the import map, unresolvable or unmapped bare
//                               specifiers skipped
//   canonicalJson(value)        JSON with sorted keys and no spaces: one spelling per value
//   buildDossier(dir, caps)     the dossier (makefun/dossier/v1) of an entry directory, as canonical JSON bytes
//
// The bounty's scorer gives buildDossier { text_max_bytes, screenshots: { max, max_bytes }, game_max_files,
// game_max_bytes, game_path_max_bytes } from its gate.json (whose keys are exactly these). Only text_max_bytes
// shapes the bytes; the other caps only refuse, so passing them too makes your program fail where the scorer
// would. The gate's game_max_files is 993, not 1000: the grader caps /output itself at 1000 entries (files and
// directories counted alike, grader/program.ts MAX_OUTPUT_FILES), and game/ counts alongside its entries, with
// screenshots/ and its 4 files and dossier.json, so 993 game entries plus those make 1000.
//
// An entry hands in game/ (the playable game as static files a desktop browser loads offline: game/index.html
// required, the game's own scripts, styles and assets, and any library it uses vendored under game/, three.js,
// Phaser, PixiJS or a WebAssembly build alike, or none; an import map is optional and may map any bare specifier to
// a file of game/) and screenshots/ (3 or 4 PNG or JPEG renders of the game, the first by name the cover). Nothing
// of either is read over the network.
//
// The dossier's text is a "## Game" block (the source, vendored and asset counts and the totals) and then the
// sources: index.html first, then the source scripts in importOrder's order (the page's classic scripts and module
// scripts in document order, each module followed by its static imports depth first), then every other source file
// by path. A source file is one under game/ with extension .html, .js, .mjs, .css, .glsl, .vert, .frag, .wgsl or
// .json, not under a directory named vendor and not named *.min.js, *.min.mjs or *.min.css; every other file (a
// library under vendor/ or minified, an image, a sound, a .wasm build) is listed in the Game block (vendored files
// by path and bytes, assets by extension with counts and bytes), never in the text. Each source follows a header
// line naming its path, lines and bytes and then its text in a fence. The text holds at most caps.text_max_bytes
// UTF-8 bytes: every source that fits goes in whole, in that order; the first that does not goes in up to its last
// complete line that fits (its fence closed, then a line naming how many of its lines are not shown), or not at
// all when not one line fits; nothing follows it but a last line naming how many whole files and how many bytes of
// source were left out. The text is deterministic: the same directory writes the same bytes.
//
// buildDossier throws DossierError on input it refuses: no game/ directory (or not a directory), an entry of
// game/ that is a symbolic link or other special file, game/ past game_max_files entries or game_max_bytes bytes
// or a path past game_path_max_bytes, no game/index.html (or one over 1 MiB), screenshots/ holding no image or
// more than the count cap, an image over its byte cap or neither PNG nor JPEG, and a text cap too small for the
// Game block and the cut line. Its error's `limit` names the cap that refused, when a cap did.
//
// The scorer's references row parses every source module with acorn (its vendored copy), so the static-import scan
// here is lexical only: it follows what a module says it imports for the dossier's order, and its refusals are the
// gate's business, not this file's. The scan skips comments, strings, templates and regular expressions; a specifier
// it cannot make sense of is left to the gate.

import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The dossier schema buildDossier writes (contracts/dossier.ts DOSSIER_SCHEMA). */
export const DOSSIER_SCHEMA = 'makefun/dossier/v1';
/** The most bytes a dossier holds (contracts/dossier.ts DOSSIER_MAX_BYTES): 4 MiB. */
export const DOSSIER_MAX_BYTES = 4 * 1024 * 1024;
/** The most images a dossier holds (contracts/dossier.ts DOSSIER_MAX_IMAGES). */
export const DOSSIER_MAX_IMAGES = 8;
/** The game's page: the one file game/ must hold. */
export const INDEX_HTML = 'index.html';
/** The most bytes game/index.html may be. */
export const INDEX_HTML_MAX_BYTES = 1024 * 1024;
/** The longest path a game file may have, in UTF-8 bytes: the platform's 1024-byte output path less 'game/'. */
export const GAME_PATH_MAX_BYTES = 1000;
/** How many vendored files the Game block lists by path before it counts the rest. */
const VENDORED_LISTED = 24;

/** The extensions a source file has (lowercase; matched case-insensitively). */
export const SOURCE_EXTENSIONS = ['html', 'js', 'mjs', 'css', 'glsl', 'vert', 'frag', 'wgsl', 'json'] as const;
/** The names a generated file has: not source, whatever its extension. */
const GENERATED_NAME = /\.min\.(?:js|mjs|css)$/i;
/** A source file's extension. */
const SOURCE_NAME = new RegExp(`\\.(?:${SOURCE_EXTENSIONS.join('|')})$`, 'i');
/** A JS module the import walk follows. */
const MODULE_NAME = /\.(?:js|mjs)$/i;

/** What a file under game/ is to the dossier: a source it shows, a vendored file or an asset it only counts. */
export type GameFileClass = 'source' | 'vendored' | 'asset';

/** A cap buildDossier or readGameTree refuses on, named in DossierError.limit. */
export type DossierLimit = 'text_max_bytes' | 'screenshots.max' | 'screenshots.max_bytes' | 'game_max_files' | 'game_max_bytes' | 'game_path_max_bytes';

/** Why buildDossier writes no dossier for a directory: its caps, its game/ or its screenshots. */
export class DossierError extends Error {
  /** The caller's cap the input is past (a key of DossierCaps or GameCaps), or null when the input itself is at fault. */
  readonly limit: DossierLimit | null;
  constructor(message: string, limit: DossierLimit | null = null) {
    super(message);
    this.name = 'DossierError';
    this.limit = limit;
  }
}

/**
 * What readGameTree is held to, each cap absent for none.
 *   game_max_files        the files and directories under game/, summed (one entry each, as the platform counts them).
 *   game_max_bytes        the files' sizes, summed (the bytes game/ costs, its directories costing none).
 *   game_path_max_bytes   each path's length in UTF-8 bytes, relative to game/.
 */
export interface GameCaps {
  game_max_files?: number;
  game_max_bytes?: number;
  game_path_max_bytes?: number;
}

/** One file under game/. */
export interface GameFile {
  /** POSIX path relative to game/, like `src/main.js`. */
  path: string;
  /** Its size in bytes. */
  bytes: number;
  cls: GameFileClass;
}

/** Every entry under game/, walked once. */
export interface GameTree {
  /** The files, in code-unit path order. */
  files: GameFile[];
  /** The directories' paths, in code-unit order (game/ itself is '' and not listed). */
  directories: string[];
  /** How many entries game/ holds: files and directories, the platform's own count. */
  count: number;
  /** The files' sizes, summed. */
  totalBytes: number;
}

/**
 * What buildDossier is held to: the text's cap in UTF-8 bytes, the screenshot caps (at most `max` images, each at
 * most `max_bytes` bytes; the dossier's own DOSSIER_MAX_IMAGES and DOSSIER_MAX_BYTES hold either way) and
 * readGameTree's caps. A bounty's gate.json may be passed whole: buildDossier reads only these keys (best-game-01's
 * gate names them text_max_bytes, screenshots, game_max_files, game_max_bytes and game_path_max_bytes).
 */
export interface DossierCaps {
  text_max_bytes: number;
  screenshots?: { max: number; max_bytes: number };
  game_max_files?: number;
  game_max_bytes?: number;
  game_path_max_bytes?: number;
}

// ---------------------------------------------------------------- bytes

const utf8 = new TextDecoder('utf-8');

/** Code-unit order, the same on every machine (localeCompare is not). */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const byteLength = (s: string): number => Buffer.byteLength(s, 'utf8');

/** A string's bytes as text, for display only (invalid UTF-8 becomes U+FFFD). */
const text = (bytes: Uint8Array): string => utf8.decode(bytes);

/** Lines of a source: 0 when empty, else its newlines plus one for a last line with none. */
function lineCount(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let n = 0;
  for (const b of bytes) if (b === 0x0a) n++;
  return bytes[bytes.length - 1] === 0x0a ? n : n + 1;
}

/** A Markdown fence one backtick longer than the longest run in `body`, three at least. */
function fenceFor(body: string): string {
  let longest = 0;
  for (const run of body.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** The fence's language tag for a source path. */
function languageOf(path: string): string {
  const ext = /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase() ?? '';
  if (ext === 'mjs' || ext === 'js') return 'js';
  if (ext === 'glsl' || ext === 'vert' || ext === 'frag') return 'glsl';
  if (ext === 'wgsl') return 'wgsl';
  if (ext === 'html') return 'html';
  if (ext === 'css') return 'css';
  if (ext === 'json') return 'json';
  return 'text';
}

// ---------------------------------------------------------------- the game tree

/** A caller's GameCaps checked: each given cap a whole number, each missing one Infinity. */
function gameCapsOf(caps: GameCaps, who: string): Record<keyof GameCaps, number> {
  const out = { game_max_files: Infinity, game_max_bytes: Infinity, game_path_max_bytes: GAME_PATH_MAX_BYTES };
  for (const k of ['game_max_files', 'game_max_bytes', 'game_path_max_bytes'] as const) {
    const v = caps[k] as unknown;
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new TypeError(`${who}: caps.${k} must be a whole number, not ${String(v)}`);
    out[k] = v;
  }
  return out;
}

/**
 * What a path under game/ is to the dossier: a source it shows, or a vendored file or an asset it only counts.
 * A generated name (*.min.js, *.min.mjs, *.min.css) and any path under a directory named vendor are vendored, a
 * source extension outside them is source, and everything else is an asset.
 */
export function classifyGamePath(path: string): GameFileClass {
  const segs = path.split('/');
  const base = segs[segs.length - 1] ?? '';
  const dirs = segs.slice(0, -1);
  if (dirs.includes('vendor') || GENERATED_NAME.test(base)) return 'vendored';
  return SOURCE_NAME.test(base) ? 'source' : 'asset';
}

/** Whether a path under game/ is a source file (classifyGamePath returns 'source'). */
export function isSourcePath(path: string): boolean {
  return classifyGamePath(path) === 'source';
}

/**
 * Every file and directory under game/, by path, with each file's bytes and class and the totals. Symbolic links
 * and other special files are refused, as are more than caps.game_max_files entries, more than caps.game_max_bytes
 * bytes in the files, and a path longer than caps.game_path_max_bytes. Nothing is read but the directory listing.
 * Throws DossierError.
 */
export function readGameTree(gameDir: string, caps: GameCaps = {}): GameTree {
  const c = gameCapsOf(caps, 'readGameTree');
  let root;
  try {
    root = lstatSync(gameDir);
  } catch {
    throw new DossierError('game/: no such directory: a game is a directory of static files, its index.html at its root');
  }
  if (!root.isDirectory()) throw new DossierError('game/: not a directory (a game is a directory of static files)');
  const files: GameFile[] = [];
  const directories: string[] = [];
  const stack: string[] = [''];
  let count = 0;
  let totalBytes = 0;
  while (stack.length > 0) {
    const rel = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(rel === '' ? gameDir : join(gameDir, rel), { withFileTypes: true });
    } catch (err) {
      throw new DossierError(`game/${rel === '' ? '' : `${rel}/`}: cannot be read (${(err as Error).message})`);
    }
    for (const e of entries) {
      const path = rel === '' ? e.name : `${rel}/${e.name}`;
      const pathBytes = byteLength(path);
      if (pathBytes > c.game_path_max_bytes) {
        throw new DossierError(`game/${path}: a path of ${pathBytes} bytes, over the ${c.game_path_max_bytes} allowed (game_path_max_bytes)`, 'game_path_max_bytes');
      }
      const shown = `game/${path}`;
      let st;
      try {
        st = lstatSync(join(gameDir, path));
      } catch {
        throw new DossierError(`${shown}: cannot be read`);
      }
      count++;
      if (count > c.game_max_files) {
        throw new DossierError(`game/: holds more than the ${c.game_max_files} files and directories allowed (game_max_files)`, 'game_max_files');
      }
      if (st.isDirectory()) {
        directories.push(path);
        stack.push(path);
      } else if (st.isFile()) {
        totalBytes += st.size;
        if (totalBytes > c.game_max_bytes) {
          throw new DossierError(`game/: its files come to more than the ${c.game_max_bytes} bytes allowed (game_max_bytes)`, 'game_max_bytes');
        }
        files.push({ path, bytes: st.size, cls: classifyGamePath(path) });
      } else {
        throw new DossierError(`${shown}: a symbolic link or special file (game/ holds plain files and directories only)`);
      }
    }
  }
  files.sort((a, b) => byCodeUnit(a.path, b.path));
  directories.sort(byCodeUnit);
  return { files, directories, count, totalBytes };
}

/** game/index.html's bytes from the tree, or why there is none: refused when missing, a directory, a link or over the cap. */
function readIndexHtml(gameDir: string, tree: GameTree): Uint8Array {
  const file = tree.files.find((f) => f.path === INDEX_HTML);
  if (file === undefined) {
    if (tree.directories.includes(INDEX_HTML)) throw new DossierError('buildDossier: game/index.html: a directory, not the page');
    throw new DossierError('buildDossier: game/index.html: no such file: a game is a directory of static files, its index.html at its root');
  }
  if (file.bytes > INDEX_HTML_MAX_BYTES) throw new DossierError(`buildDossier: game/index.html: ${file.bytes} bytes, over the ${INDEX_HTML_MAX_BYTES} a page may be`);
  try {
    return new Uint8Array(readFileSync(join(gameDir, INDEX_HTML)));
  } catch (err) {
    throw new DossierError(`buildDossier: game/index.html: cannot be read (${(err as Error).message})`);
  }
}

// ---------------------------------------------------------------- the page

/** One <script> of a page. */
export interface HtmlScript {
  /** Its src attribute, or null when the script is inline. */
  src: string | null;
  /** Its type attribute, lowercased and trimmed ('' when absent). */
  type: string;
  /** An inline script's text ('' for one with src or no body). */
  text: string;
}

/** One <link> of a page. */
export interface HtmlLink {
  href: string;
  /** Its rel attribute, lowercased and trimmed. */
  rel: string;
}

/** One element of a page that loads a file through its src attribute: <img>, <source>, <video>, <audio> or <iframe>. */
export interface HtmlResource {
  /** Its tag name, lowercased. */
  tag: string;
  /** Its src attribute. */
  src: string;
}

/** The tags whose src is a resource the page loads. */
const RESOURCE_TAGS = ['img', 'source', 'video', 'audio', 'iframe'] as const;

/** One <script type="importmap"> block. */
export interface HtmlImportMap {
  /** Its JSON, when it parsed. */
  value: unknown;
  /** Why its text is not JSON, or null. */
  error: string | null;
}

/** What a page's markup says about the files it loads. */
export interface HtmlFacts {
  /** Every <script>, in document order. */
  scripts: HtmlScript[];
  /** Every <link> with an href, in document order. */
  links: HtmlLink[];
  /** Every <img>, <source>, <video>, <audio> and <iframe> with a src, in document order. */
  resources: HtmlResource[];
  /** Every <script type="importmap">, in document order. */
  importMaps: HtmlImportMap[];
}

/** The index of `>` ending a tag whose body starts at `from`, honoring quoted attribute values; -1 when there is none. */
function tagEnd(html: string, from: number): number {
  let quote = '';
  for (let i = from; i < html.length; i++) {
    const ch = html[i]!;
    if (quote !== '') {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') return i;
  }
  return -1;
}

/** A tag body's attributes, names lowercased, values unquoted; a present attribute with no value is ''. */
function attributesOf(body: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /[\s/]/.test(body[i]!)) i++;
    if (i >= body.length) break;
    const start = i;
    while (i < body.length && !/[\s=/>]/.test(body[i]!)) i++;
    const name = body.slice(start, i).toLowerCase();
    while (i < body.length && /\s/.test(body[i]!)) i++;
    let value = '';
    if (body[i] === '=') {
      i++;
      while (i < body.length && /\s/.test(body[i]!)) i++;
      const quote = body[i];
      if (quote === '"' || quote === "'") {
        const end = body.indexOf(quote, i + 1);
        value = body.slice(i + 1, end < 0 ? body.length : end);
        i = end < 0 ? body.length : end + 1;
      } else {
        // An unquoted value runs to whitespace or the tag's >; a / inside it is part of the value.
        const s = i;
        while (i < body.length && !/[\s>]/.test(body[i]!)) i++;
        value = body.slice(s, i);
      }
    }
    if (name !== '') out.set(name, value);
  }
  return out;
}

/** The index of `</name` at or after `from`, ASCII case-insensitively; -1 when there is none. */
function closeIndexOf(html: string, from: number, name: string): number {
  const needle = `</${name}`;
  for (let i = from; i + needle.length <= html.length; i++) {
    if (html[i] !== '<') continue;
    let hit = true;
    for (let j = 1; j < needle.length; j++) {
      const a = html[i + j]!.toLowerCase();
      if (a !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return i;
  }
  return -1;
}

/**
 * Every <script>, <link href>, <img src>, <source src>, <video src>, <audio src>, <iframe src> and
 * <script type="importmap"> of a page, in document order. Comments and the document type are skipped. This is a tag
 * scan, not an HTML parser: it reads the attributes these tags carry and nothing else.
 */
export function htmlFacts(html: string): HtmlFacts {
  const scripts: HtmlScript[] = [];
  const links: HtmlLink[] = [];
  const resources: HtmlResource[] = [];
  const importMaps: HtmlImportMap[] = [];
  let i = 0;
  while (i < html.length) {
    const at = html.indexOf('<', i);
    if (at < 0) break;
    if (html.startsWith('<!--', at)) {
      const end = html.indexOf('-->', at + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', at)) {
      const end = html.indexOf('>', at + 2);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    const rest = html.slice(at + 1, at + 8).toLowerCase();
    if (rest.startsWith('script') && !/[A-Za-z0-9]/.test(html[at + 7] ?? '')) {
      const end = tagEnd(html, at + 7);
      if (end < 0) break;
      const attrs = attributesOf(html.slice(at + 7, end));
      const type = (attrs.get('type') ?? '').trim().toLowerCase();
      const src = attrs.get('src') ?? null;
      let body = '';
      if (src === null) {
        const close = closeIndexOf(html, end + 1, 'script');
        body = html.slice(end + 1, close < 0 ? html.length : close);
        i = close < 0 ? html.length : close + 8;
      } else {
        const close = closeIndexOf(html, end + 1, 'script');
        i = close < 0 ? html.length : close + 8;
      }
      if (type === 'importmap') {
        let value: unknown = null;
        let error: string | null = null;
        try {
          value = JSON.parse(body);
        } catch (err) {
          error = (err as Error).message;
        }
        importMaps.push({ value, error });
      } else {
        scripts.push({ src, type, text: src === null ? body : '' });
      }
      continue;
    }
    if (rest.startsWith('link') && !/[A-Za-z0-9]/.test(html[at + 5] ?? '')) {
      const end = tagEnd(html, at + 5);
      if (end < 0) break;
      const attrs = attributesOf(html.slice(at + 5, end));
      const href = attrs.get('href');
      if (href !== undefined) links.push({ href, rel: (attrs.get('rel') ?? '').trim().toLowerCase() });
      i = end + 1;
      continue;
    }
    const tag = RESOURCE_TAGS.find((name) => rest.startsWith(name) && !/[A-Za-z0-9]/.test(html[at + 1 + name.length] ?? ''));
    if (tag !== undefined) {
      const end = tagEnd(html, at + 1 + tag.length);
      if (end < 0) break;
      const attrs = attributesOf(html.slice(at + 1 + tag.length, end));
      const src = attrs.get('src');
      if (src !== undefined) resources.push({ tag, src });
      i = end + 1;
      continue;
    }
    const end = tagEnd(html, at + 1);
    i = end < 0 ? html.length : end + 1;
  }
  return { scripts, links, resources, importMaps };
}

/** A page's import map: its imports and scopes, each a specifier to a reference; a null value blocks its specifier. */
export interface ImportMap {
  imports: Record<string, string | null>;
  scopes: Record<string, Record<string, string | null>>;
}

/**
 * A page's one import map, or none: `map` and `error` both null when the page holds no import map (it is optional),
 * `map` null and `error` saying why when the page holds one that cannot be used.
 */
export interface ImportMapRead {
  map: ImportMap | null;
  error: string | null;
}

/** Whether `value` is a plain object. */
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** An own enumerable property set whatever its key: a "__proto__" key stays a key, never the prototype. */
function setOwn<T>(o: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(o, key, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * The page's import map, parsed: none (map and error null) when the page holds no <script type="importmap">, else
 * its one map, or why it cannot be used (a second map, text that is not JSON, or a shape an import map does not have).
 * "imports" and "scopes" are each optional; a null value is kept: it blocks its specifier.
 */
export function importMapOf(facts: HtmlFacts): ImportMapRead {
  if (facts.importMaps.length === 0) return { map: null, error: null };
  if (facts.importMaps.length > 1) return { map: null, error: `index.html holds ${facts.importMaps.length} import maps: a page holds one at most` };
  const only = facts.importMaps[0]!;
  if (only.error !== null) return { map: null, error: `index.html's import map is not JSON (${only.error})` };
  if (!isObject(only.value)) return { map: null, error: 'index.html\'s import map is not a JSON object' };
  const importsRaw = only.value.imports ?? {};
  if (!isObject(importsRaw)) return { map: null, error: 'index.html\'s import map holds an "imports" that is not an object' };
  const imports: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(importsRaw)) {
    if (value !== null && typeof value !== 'string') return { map: null, error: `index.html's import map maps ${JSON.stringify(key)} to no string` };
    setOwn(imports, key, value);
  }
  const scopes: Record<string, Record<string, string | null>> = {};
  const scopesRaw = only.value.scopes;
  if (scopesRaw !== undefined) {
    if (!isObject(scopesRaw)) return { map: null, error: 'index.html\'s import map holds a "scopes" that is not an object' };
    for (const [scope, entries] of Object.entries(scopesRaw)) {
      if (!isObject(entries)) return { map: null, error: `index.html's import map scope ${JSON.stringify(scope)} is not an object` };
      const inner: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(entries)) {
        if (value !== null && typeof value !== 'string') return { map: null, error: `index.html's import map scope ${JSON.stringify(scope)} maps ${JSON.stringify(key)} to no string` };
        setOwn(inner, key, value);
      }
      setOwn(scopes, scope, inner);
    }
  }
  return { map: { imports, scopes }, error: null };
}

/** A URI scheme's leading `name:`. */
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/** Whether a reference is relative: not empty, no scheme, no leading // and no leading /. */
export function isRelativeRef(ref: string): boolean {
  return ref.length > 0 && !URI_SCHEME.test(ref) && !ref.startsWith('//') && !ref.startsWith('/');
}

/**
 * Whether a module specifier is relative in JavaScript's sense: it starts with ./ or ../ (or is . or ..). A
 * specifier like `phaser` or `main.js` is bare: a browser resolves it through the import map or fails, it never
 * loads a file beside the importer. isRelativeRef answers for a URL reference (an attribute or an import-map value),
 * where `main.js` is relative to the page.
 */
export function isRelativeSpecifier(specifier: string): boolean {
  return specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../');
}

/**
 * The path under game/ that the relative reference `ref` names, resolved against the importing file's path
