// Open-source LLM behind an OpenAI-compatible API: llama.cpp's llama-server
// (default), Ollama (LLM_URL=http://127.0.0.1:11434), vLLM or LM Studio.
// Default model: Qwen2.5 1.5B Instruct (Q4_K_M), which runs on a laptop CPU.

import { SYSTEM, ACTIONS_HELP, RESPONSE_SCHEMA } from './knowledge.js';
import { relevant, compact, roles } from './catalog.js';

export const LLM_URL = (process.env.LLM_URL || 'http://127.0.0.1:8081').replace(/\/+$/, '');
export const MODEL = process.env.GRIDMIND_MODEL || 'qwen2.5-1.5b-instruct-q4_k_m';

const INDEXES = { "eai": 'Energy Access Potential', "demand": 'Demand Index', "supply": 'Supply Index', "ani": 'Assistance Need Index' };

let available = { "ok": false, "at": 0 };

// Is the model server up? Cached for 15s so each chat does not pay for it.
export async function llm_available() {
	if (Date.now() - available.at < 15000) return available.ok;

	let ok = false;
	try {
		const r = await fetch(`${LLM_URL}/v1/models`, { "signal": AbortSignal.timeout(1500) });
		ok = r.ok && ((await r.json()).data || []).length > 0;
	} catch {
		ok = false;
	}

	available = { ok, "at": Date.now() };
	return ok;
}

// One worked example built from this geography's real ids, so a small model
// sees the exact JSON shape and id style it must produce.
function example(catalog, divisions = []) {
	const r = roles(catalog);
	if (!r.population || !r.ghi || !r.grid) return [];

	const division = divisions[0] || 'Districts';

	return [
		{ "role": 'user', "content": 'Which areas have the most people living far from the grid?' },
		{ "role": 'assistant', "content": JSON.stringify({
			"intent":  'find_areas',
			"reply":   `I turned on ${r.population.name} and ${r.grid.name}, kept only areas more than 20 km from the grid, and ranked the ${division.toLowerCase()} by population. The list follows.`,
			"actions": [
				{ "type": 'activate', "ids": [r.population.id, r.grid.id] },
				{ "type": 'filter', "id": r.grid.id, "min": 20 },
				{ "type": 'areas', "top": 5, division, "sort_by": r.population.id, "order": 'desc' },
			],
		}) },
		{ "role": 'user', "content": 'Make solar potential more important' },
		{ "role": 'assistant', "content": JSON.stringify({
			"intent":  'layer_control',
			"reply":   `I set the importance of ${r.ghi.name} to 5 out of 5.`,
			"actions": [{ "type": 'weight', "id": r.ghi.id, "weight": 5 }],
		}) },
		{ "role": 'user', "content": 'Show me where stand-alone solar makes sense' },
		{ "role": 'assistant', "content": JSON.stringify({
			"intent":  'standalone',
			"reply":   `I turned on ${r.population.name}, ${r.ghi.name} and ${r.grid.name}, kept only areas more than 25 km from the grid, and switched to the Assistance Need Index.`,
			"actions": [
				{ "type": 'activate', "ids": [r.population.id, r.ghi.id, r.grid.id] },
				{ "type": 'filter', "id": r.grid.id, "min": 25 },
				{ "type": 'index', "index": 'ani' },
			],
		}) },
		{ "role": 'user', "content": 'What does GHI mean?' },
		{ "role": 'assistant', "content": JSON.stringify({
			"intent":  'explain_resources',
			"reply":   'GHI (Global Horizontal Irradiation) is the solar energy reaching a horizontal surface, in kWh/m². Higher GHI means more output per solar panel, so it is a key Supply layer for solar mini-grids and stand-alone PV.',
			"actions": [],
		}) },
	];
}

export async function ask({ message, history = [], context = {} }) {
	const catalog = context.catalog || [];
	const layers = relevant(catalog, message);

	// Static part first (instructions + worked examples) so the model server
	// reuses its cache; only the layer list and the question are new each time.
	const messages = [
		{ "role": 'system', "content": `${SYSTEM}\n\n${ACTIONS_HELP}` },
		...example(catalog, context.divisions),
		...history.slice(-4).map(h => ({ "role": h.role === 'assistant' ? 'assistant' : 'user', "content": String(h.content).slice(0, 600) })),
		{ "role": 'user', "content": [
			`GEOGRAPHY: ${context.geography || 'unknown'}; DIVISIONS: ${(context.divisions || []).join(', ') || 'none'}`,
			`MAP STATE: index=${INDEXES[context.index] || context.index || 'n/a'}; active layers=${(context.layers || []).join(', ') || 'none'}`,
			`AVAILABLE LAYERS (id | name | group | range):\n${compact(layers)}`,
			`QUESTION: ${message}`,
		].join('\n') },
	];

	const r = await fetch(`${LLM_URL}/v1/chat/completions`, {
		"method":  'POST',
		"headers": { "Content-Type": 'application/json' },
		"signal":  AbortSignal.timeout(+(process.env.GRIDMIND_TIMEOUT || 180000)),
		"body":    JSON.stringify({
			"model":           MODEL,
			messages,
			"temperature":     0.2,
			"max_tokens":      400,
			"response_format": { "type": 'json_schema', "json_schema": { "name": 'gridmind', "schema": RESPONSE_SCHEMA } },
		}),
	});

	if (!r.ok) throw new Error(`model server answered ${r.status}: ${(await r.text()).slice(0, 300)}`);

	const j = await r.json();
	const out = JSON.parse(j.choices[0].message.content);

	return {
		"intent":  out.intent,
		"reply":   String(out.reply || '').trim(),
		"actions": Array.isArray(out.actions) ? out.actions : [],
		"timing":  { "prompt_tokens": j.usage?.prompt_tokens, "output_tokens": j.usage?.completion_tokens },
	};
}
