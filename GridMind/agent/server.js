// GridMind agent server. No dependencies: node agent/server.js
//
//   POST /chat    { message, history, context } -> { reply, actions, engine, intent?, timing? }
//   GET  /health  -> { ok, engine, model, llm }
//
// GRIDMIND_ENGINE: auto (rules for clear requests, LLM for the rest) | llm | rules

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ask, llm_available, MODEL } from './llm.js';
import { respond } from './rules.js';
import { validate } from './actions.js';

const PORT = +(process.env.PORT || 8787);
const ENGINE = process.env.GRIDMIND_ENGINE || 'auto';
const MAX_BODY = 1024 * 1024;

// Hybrid routing: on a laptop CPU the LLM takes tens of seconds, so plain,
// common requests that the rules engine recognises are answered instantly and
// the LLM handles what rules cannot: other languages, numbers, comparisons,
// follow-ups and anything unrecognised.
const NON_ENGLISH = /[àâçéèêëîïôûùüÿœæáíóúñ]|\b(le|la|les|des|du|une|est|où|comment|quels?|quelles?|montre|nionyeshe|wapi|maeneo|kwa|onde|donde|dónde)\b/i;
const NUANCE = /\d|\b(but|except|important|importance|weight|twice|than|between|compare|why|instead|exclude|only keep|at least|at most)\b/i;
const FOLLOW_UP = /^(and|also|now|then|what about|how about)\b|\b(it|them|that one|those|these|there)\b/i;

export function needs_llm(message, rules_out, history = []) {
	if (rules_out.intent === 'unknown') return true;
	if (NON_ENGLISH.test(message) || NUANCE.test(message)) return true;
	if (history.length && FOLLOW_UP.test(message)) return true;
	return false;
}

export async function chat({ message, history = [], context = {} }, engine = ENGINE, debug = false) {
	message = String(message || '').trim().slice(0, 2000);
	if (!message) return { "reply": 'Please type a question.', "actions": [], "engine": 'none' };

	const catalog = Array.isArray(context.catalog) ? context.catalog : [];
	const divisions = Array.isArray(context.divisions) ? context.divisions : [];

	const use_llm = engine === 'llm' ||
		(engine === 'auto' && needs_llm(message, respond(message, context), history) && await llm_available());

	if (use_llm) {
		try {
			const out = await ask({ message, history, context });
			return { ...out, "actions": validate(out.actions, catalog, divisions), "engine": `llm:${MODEL}`, ...(debug ? { "proposed": out.actions } : {}) };
		} catch (e) {
			console.error('LLM failed, falling back to rules:', e.message);
			if (engine === 'llm') throw e;
		}
	}

	const out = respond(message, context);
	return { ...out, "actions": validate(out.actions, catalog, divisions), "engine": 'rules', ...(debug ? { "proposed": out.actions } : {}) };
}

function send(res, status, body) {
	res.writeHead(status, {
		"Content-Type":                 'application/json',
		"Access-Control-Allow-Origin":  '*',
		"Access-Control-Allow-Methods": 'GET, POST, OPTIONS',
		"Access-Control-Allow-Headers": 'Content-Type',
	});
	res.end(JSON.stringify(body));
}

function read_json(req) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];

		req.on('data', c => {
			size += c.length;
			if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); }
			else chunks.push(c);
		});
		req.on('end', () => {
			try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
			catch { reject(new Error('invalid JSON')); }
		});
		req.on('error', reject);
	});
}

const server = http.createServer(async (req, res) => {
	if (req.method === 'OPTIONS') return send(res, 204, {});

	if (req.method === 'GET' && req.url === '/health')
		return send(res, 200, { "ok": true, "engine": ENGINE, "model": MODEL, "llm": await llm_available() });

	if (req.method === 'POST' && req.url === '/chat') {
		const t0 = Date.now();
		try {
			const body = await read_json(req);
			const out = await chat(body);
			console.log(`${new Date().toISOString()} [${out.engine}] ${((Date.now() - t0) / 1000).toFixed(1)}s ${JSON.stringify(String(body.message).slice(0, 80))} -> ${out.actions.length} actions`);
			return send(res, 200, out);
		} catch (e) {
			console.error(e);
			return send(res, 500, { "error": e.message });
		}
	}

	send(res, 404, { "error": 'not found' });
});

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] || '')) {
	server.listen(PORT, '127.0.0.1', async () => {
		console.log(`GridMind agent on http://127.0.0.1:${PORT} (engine=${ENGINE}, model=${MODEL}, llm ${await llm_available() ? 'ready' : 'NOT available, using rules'})`);
	});
}
