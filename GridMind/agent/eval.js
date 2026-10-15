// Accuracy evaluation over the annotated examples in data/intents.jsonl,
// against a real geography catalog (data/catalog-kenya.json).
//
//   node eval.js                  # engine=auto (LLM if the model server is up)
//   node eval.js --engine=rules   # rules baseline
//   node eval.js --engine=llm --out=results/llm.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chat } from './server.js';
import { roles } from './catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;

const engine = arg('engine', 'auto');
const out_file = arg('out', null);
const limit = +arg('limit', 0);

const fixture = JSON.parse(fs.readFileSync(path.join(here, 'data/catalog-kenya.json'), 'utf8'));
let examples = fs.readFileSync(path.join(here, 'data/intents.jsonl'), 'utf8')
	.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
if (limit) examples = examples.slice(0, limit);

const r = roles(fixture.catalog);
const ids = new Set(fixture.catalog.map(d => d.id));

const context = {
	"geography": fixture.geography,
	"index":     'eai',
	"layers":    [],
	"divisions": ['Counties', 'Subcounties'],
	"catalog":   fixture.catalog,
};

// Each expectation becomes one or more named checks.
function checks(expect, res) {
	const acts = res.actions;
	const on = new Set(acts.filter(a => a.type === 'activate').flatMap(a => a.ids));
	const off = new Set(acts.filter(a => a.type === 'deactivate').flatMap(a => a.ids));
	const out = [];

	for (const role of expect.activate || [])
		if (r[role]) out.push([`activate ${role}`, on.has(r[role].id)]);

	for (const role of expect.deactivate || [])
		if (r[role]) out.push([`deactivate ${role}`, off.has(r[role].id)]);

	if (expect.filter && r[expect.filter.role]) {
		const f = acts.find(a => a.type === 'filter' && a.id === r[expect.filter.role].id);
		const bound = f && typeof f[expect.filter.bound] === 'number';
		const value = expect.filter.value === undefined || (f && Math.abs(f[expect.filter.bound] - expect.filter.value) < 0.01);
		out.push([`filter ${expect.filter.role} ${expect.filter.bound}`, !!(bound && value)]);
	}

	if (expect.weight && r[expect.weight])
		out.push([`weight ${expect.weight}`, acts.some(a => a.type === 'weight' && a.id === r[expect.weight].id && a.weight >= 4)]);

	if (expect.index)
		out.push([`index ${expect.index}`, acts.some(a => a.type === 'index' && a.index === expect.index)]);

	if (expect.panel)
		out.push([`panel ${expect.panel}`, acts.some(a => a.type === 'panel' && a.panel === expect.panel)]);

	if (expect.action)
		out.push([expect.action, acts.some(a => a.type === expect.action)]);

	if (expect.no_layer_changes)
		out.push(['no layer changes', !acts.some(a => ['activate', 'deactivate', 'filter', 'weight'].includes(a.type))]);

	return out;
}

function invented(proposed = []) {
	return proposed.flatMap(a => [...(a.ids || []), ...(a.id ? [a.id] : [])]).filter(id => !ids.has(id));
}

const rows = [];
let n = 0;

for (const ex of examples) {
	n += 1;
	const t0 = Date.now();
	let res;

	try {
		res = await chat({ "message": ex.text, "history": [], context }, engine, true);
	} catch (e) {
		res = { "intent": 'error', "reply": e.message, "actions": [], "engine": 'error' };
	}

	const seconds = (Date.now() - t0) / 1000;
	const c = checks(ex.expect, res);
	const row = {
		"text":          ex.text,
		"lang":          ex.lang || 'en',
		"intent":        ex.intent,
		"predicted":     res.intent,
		"intent_ok":     res.intent === ex.intent,
		"checks":        c.map(([name, ok]) => ({ name, ok })),
		"actions_ok":    c.every(([, ok]) => ok),
		"invented_ids":  invented(res.proposed),
		seconds,
		"engine":        res.engine,
		"reply":         res.reply,
		"actions":       res.actions,
	};
	rows.push(row);

	const mark = (row.intent_ok ? 'I' : 'i') + (row.actions_ok ? 'A' : 'a');
	console.log(`${String(n).padStart(2)}/${examples.length} ${mark} ${seconds.toFixed(1).padStart(5)}s ${ex.text.slice(0, 60)}${row.actions_ok ? '' : `  <- failed: ${c.filter(([, ok]) => !ok).map(([k]) => k).join(', ')}`}${row.intent_ok ? '' : `  [intent ${res.intent}]`}`);
}

const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : 'n/a';
const all_checks = rows.flatMap(x => x.checks);
const by_lang = {};
for (const x of rows) (by_lang[x.lang] ||= []).push(x);

const summary = {
	"engine":          Object.entries(rows.reduce((m, x) => ({ ...m, [x.engine]: (m[x.engine] || 0) + 1 }), {})).map(([k, v]) => `${k} x${v}`).join(', '),
	"examples":        rows.length,
	"intent_accuracy": pct(rows.filter(x => x.intent_ok).length, rows.length),
	"action_accuracy": pct(rows.filter(x => x.actions_ok).length, rows.length),
	"check_accuracy":  pct(all_checks.filter(x => x.ok).length, all_checks.length),
	"invented_ids":    rows.reduce((a, x) => a + x.invented_ids.length, 0),
	"by_language":     Object.fromEntries(Object.entries(by_lang).map(([k, v]) => [k, `${v.filter(x => x.actions_ok).length}/${v.length} actions ok`])),
	"median_seconds":  rows.map(x => x.seconds).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
	"median_llm_seconds": (l => l.length ? l[Math.floor(l.length / 2)] : null)(rows.filter(x => String(x.engine).startsWith('llm')).map(x => x.seconds).sort((a, b) => a - b)),
};

console.log('\n' + JSON.stringify(summary, null, 2));

if (out_file) {
	fs.mkdirSync(path.dirname(path.resolve(here, out_file)), { "recursive": true });
	fs.writeFileSync(path.resolve(here, out_file), JSON.stringify({ summary, rows }, null, 2));
	console.log(`wrote ${out_file}`);
}
