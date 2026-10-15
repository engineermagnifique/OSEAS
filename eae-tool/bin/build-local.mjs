// Local Windows-friendly build of the EAE tool (no bmake/jq/curl needed).
//
//   cd eae-tool
//   node bin/build-local.mjs [OUT_DIR]
//
// OUT_DIR defaults to ../../eae-preview/dist. Serve it with
// `python -m http.server 8080` and open /tool/a/?id=<geography id>.
//
// It follows the makefile: the file lists of build-a/s/m/p are read from it,
// so the two stay in sync. Needs node 20+, go and tsc on PATH.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
process.chdir(ROOT);

const OUT = path.resolve(process.argv[2] || '../../eae-preview/dist');
const DIST = path.join(OUT, 'tool');
const LIB = path.join(ROOT, 'lib');
const JS = path.join(ROOT, 'tsbuild', 'src');
const BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'eae-bin-'));
const EXE = process.platform === 'win32' ? '.exe' : '';

// Public settings of energyaccessexplorer.org (as served in its tool/a/main.js).
const SETTINGS = {
	domain: 'energyaccessexplorer.org',
	world: 'https://world.energyaccessexplorer.org',
	title: 'Energy Access Explorer',
	database: 'https://api.energyaccessexplorer.org',
	storage: 'https://wri-public-data.s3.amazonaws.com/EnergyAccess/',
	mapbox_token: 'pk.eyJ1IjoicmVzb3VyY2V3YXRjaCIsImEiOiJjam54YzhjemcxemNzM3Bta3FkNXk1Z2E1In0.RqblpgU2zkMIsMCP8QPdlQ',
	mapbox_theme: 'mapbox/basic-v9',
	chat_url: process.env.CHAT_URL || '',
};

// Website files the tool pages link to (the eae-website source is not in this repo).
const SITE = 'https://www.energyaccessexplorer.org';
const SITE_FILES = [
	'stylesheets/style.css',
	'stylesheets/nav.css',
	'stylesheets/thumbnails.css',
	'stylesheets/env.css',
	'javascripts/nav.js',
	'images/EAE Logo_Emblem.svg',
];

async function fetch_to(url, dest) {
	const r = await fetch(url);
	if (!r.ok) throw new Error(`${r.status} fetching ${url}`);
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

async function deps() {
	const lines = fs.readFileSync('dependencies.tsv', 'utf8').split(/\r?\n/).filter(l => l.trim());
	for (const l of lines) {
		const [target, origin] = l.trim().split(/\s+/);
		const dest = path.join(LIB, target);
		if (fs.existsSync(dest)) continue;
		console.log('fetch', target);
		await fetch_to(origin, dest);
		if (target.endsWith('.js')) fs.appendFileSync(dest, '\n\n');
	}

	const pptx = path.join(LIB, 'pptxgen.js');
	fs.writeFileSync(pptx, fs.readFileSync(pptx, 'utf8').replace('var PptxGenJS=', 'window.PptxGenJS='));
	fs.writeFileSync(path.join(LIB, 'pptxgen.d.ts'), 'declare const PptxGenJS: any;\nexport default PptxGenJS;\n');
}

function makefile_targets() {
	const text = fs.readFileSync('makefile', 'utf8').replace(/\\\r?\n\s*/g, ' ');
	const targets = {};
	let current = null;
	for (const line of text.split(/\r?\n/)) {
		const t = line.match(/^([\w-]+):/);
		if (t) { current = targets[t[1]] = []; continue; }
		if (current && /^\t/.test(line)) current.push(line.trim().replace(/^@\s*/, ''));
	}
	return targets;
}

function expand(s, screen_dist) {
	return s
		.replace(/\$\{DIST\}\//g, screen_dist + '/')
		.replace(/\$\{JS\}/g, JS)
		.replace(/\$\{LIB\}/g, LIB)
		.replace(/\$\{CSS\}/g, path.join(ROOT, 'stylesheets'));
}

function build_screen(screen, cmds, timestamp) {
	console.log('screen', screen);
	const dir = path.join(DIST, screen);
	fs.mkdirSync(path.join(dir, 'components'), { recursive: true });

	const html = path.join(dir, 'index.html');
	execFileSync(path.join(BIN, 'templates' + EXE), [`-template=${screen}`, `-output=${html}`, '-json={"env":""}']);
	fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace(/--TIMESTAMP--/g, timestamp));

	for (const c of cmds) {
		const cmd = expand(c, DIST);
		let m;
		if ((m = cmd.match(/^cp (.+)$/))) {
			const files = m[1].trim().split(/\s+/);
			const dest = files.pop();
			for (const f of files) fs.copyFileSync(f, path.join(dest, path.basename(f)));
		}
		else if ((m = cmd.match(/^(echo "window\.EAE = \{\};" \| )?cat -? ?(.+?)\s*>\s*(\S+)$/))) {
			const parts = m[1] ? ['window.EAE = {};\n'] : [];
			for (const f of m[2].trim().split(/\s+/)) parts.push(fs.readFileSync(f, 'utf8'));
			fs.writeFileSync(m[3], parts.join(''));
		}
	}
}

async function main() {
	// Build with whatever Go is installed: a go.mod asking for a newer patch
	// release would otherwise make go try to download that toolchain.
	console.log('go build templates, locales');
	const modfile = path.join(BIN, 'go.mod');
	fs.writeFileSync(modfile, 'module eae-tool\n\ngo 1.21\n');
	const goenv = { ...process.env, GOTOOLCHAIN: 'local' };
	for (const t of ['templates', 'locales'])
		execFileSync('go', ['build', `-modfile=${modfile}`, '-o', path.join(BIN, t + EXE), `./${t}`], { stdio: 'inherit', env: goenv });

	await deps();

	console.log('tsc');
	fs.rmSync('tsbuild', { recursive: true, force: true });
	try { execSync('tsc -p .', { stdio: 'inherit' }); }
	catch { if (!fs.existsSync(JS)) throw new Error('tsc produced no output'); console.log('(tsc reported type errors; output was emitted anyway)'); }

	fs.writeFileSync('settings.tmp.json', `\nEAE['settings'] = ${JSON.stringify(SETTINGS, null, 2)};\n`);

	console.log('translations');
	execFileSync(path.join(BIN, 'locales' + EXE), ['-translations=locales/translations.csv', '-units=locales/units.csv', '-output=locales/translations.js.tmp'], { stdio: 'inherit' });

	fs.rmSync(DIST, { recursive: true, force: true });
	fs.mkdirSync(DIST, { recursive: true });
	fs.cpSync(LIB, path.join(DIST, 'lib'), { recursive: true });

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const targets = makefile_targets();
	for (const s of ['a', 's', 'm', 'p']) build_screen(s, targets[`build-${s}`], timestamp);

	execFileSync(path.join(BIN, 'templates' + EXE), ['-template=index', `-output=${path.join(DIST, 'index.html')}`, '-json={"env":""}']);

	for (const f of SITE_FILES) {
		const dest = path.join(OUT, f);
		if (fs.existsSync(dest)) continue;
		try { await fetch_to(`${SITE}/${encodeURI(f)}`, dest); console.log('site', f); }
		catch (e) { console.warn('skip', f, '-', e.message); }
	}

	fs.rmSync(BIN, { recursive: true, force: true });
	console.log(`\nDone: ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
