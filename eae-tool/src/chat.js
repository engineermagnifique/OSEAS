// GridMind: chat assistant that guides users through the analysis screen.
//
// Questions go to the GridMind agent (GridMind/agent, EAE['settings'].chat_url)
// together with the map context and this geography's layer catalog. The agent
// answers with a reply and a list of actions, which are run here through the
// same functions the left panel and cards use.

import {
	ce,
	qs,
	maybe,
} from '../lib/helpers.js';

import { get_admin_area_item } from './mapbox.js';
import { get_admin_area_layer_data } from './area-analysis.js';
import { analysis_colorscale } from './analysis.js';
import { uniform_split } from './utils.js';
import { t, getScaleLabels } from './translate.js';

const CHAT_URL = (maybe(EAE, 'settings', 'chat_url') || 'http://127.0.0.1:8787/chat');

const INDEXES = {
	"eai":    "Energy Access Potential",
	"demand": "Demand Index",
	"supply": "Supply Index",
	"ani":    "Assistance Need Index",
};

const PANELS = {
	"cards":       "Active Layers",
	"controls":    "Add Layers",
	"geographies": "Change Geographies",
	"vectors":     "Search Features",
	"locations":   "Search POI's",
};

const SUGGESTIONS = [
	"Where should we build solar mini-grids?",
	"Which areas need stand-alone PV?",
	"Prioritise areas for grid extension",
	"What do the colours on the map mean?",
	"How do I make a report?",
];

const LEGEND_QUESTION = "What do the colours on the map mean?";

const history = [];

const escape = s => String(s).replace(/[&<>"']/g, c => ({ "&": '&amp;', "<": '&lt;', ">": '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// plain text with light markdown (bold, line breaks) from the model -> safe HTML
const format = s => escape(s)
	.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
	.replace(/\n/g, '<br>');

function catalog() {
	if (!window.DST) return [];

	return Array.from(DST.values())
		.filter(d => !d.disabled)
		.filter(d => !['outline', 'boundaries', 'admin-tiers'].includes(maybe(d, 'category', 'name')))
		.map(d => ({
			"id":       d.id,
			"name":     d.name,
			"category": maybe(d, 'category', 'name'),
			"path":     (maybe(d, 'category', 'controls', 'path') || []).join('/'),
			"unit":     maybe(d, 'category', 'unit') || '',
			"type":     d.type,
			"domain":   d.domain || null,
			"on":       !!d.on,
		}));
}

function context() {
	const datasets = maybe(window.STATE, 'datasets') || [];

	return {
		"geography": maybe(window.GEOGRAPHY, 'name') || null,
		"index":     maybe(window.STATE, 'index') || null,
		"view":      maybe(window.STATE, 'view') || null,
		"layers":    datasets.filter(d => d.on && maybe(d, 'category', 'name') !== 'outline').map(d => d.name).filter(Boolean),
		"divisions": (maybe(window.GEOGRAPHY, 'divisions') || []).slice(1).map(d => d.name).filter(Boolean),
		"catalog":   catalog(),
	};
}

// --- actions, run with the app's own controls ---

function open_tab(tab) {
	const a = qs(`#drawer a[for="${tab}"]`);
	if (a && !a.classList.contains('active')) a.click();
}

function set_index(index) {
	const select = qs('#index-select');
	if (!select) return false;

	select.value = index;
	select.dispatchEvent(new Event('change'));

	return true;
}

function open_right_panel() {
	const b = qs('#right-panel-show');
	if (b && b.offsetParent !== null) b.click();
}

// A layer's card (range and weight controls) only exists once its data loaded.
async function card_of(ds, timeout = 60000) {
	const t0 = Date.now();
	while (!ds.card && !ds.disabled && Date.now() - t0 < timeout)
		await new Promise(r => setTimeout(r, 250));

	return ds.card || null;
}

const wait = async (test, timeout = 90000, step = 250) => {
	const t0 = Date.now();
	while (!test() && Date.now() - t0 < timeout)
		await new Promise(r => setTimeout(r, step));
	return test();
};

const fmt = (v, unit) => {
	if (typeof v !== 'number' || !isFinite(v)) return '–';
	const n = Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : (+v.toFixed(1)).toLocaleString();
	return unit && unit !== 'count' ? `${n} ${unit}` : n;
};

let markers = [];

// keep the fitted areas clear of the GridMind panel on the right
function padding() {
	const p = qs('#gridmind-panel');
	const right = (p && !p.hidden) ? p.offsetWidth + 50 : 80;
	return { "top": 80, "bottom": 80, "left": 80, right };
}

function highlight(items) {
	for (const m of markers) m.remove();
	markers = [];

	const fc = { "type": 'FeatureCollection', "features": items.map(it => ({ "type": 'Feature', "geometry": it.feature.geometry, "properties": {} })) };

	if (MAPBOX.getSource('gridmind-areas')) MAPBOX.getSource('gridmind-areas').setData(fc);
	else {
		MAPBOX.addSource('gridmind-areas', { "type": 'geojson', "data": fc });
		MAPBOX.addLayer({ "id": 'gridmind-areas-casing', "type": 'line', "source": 'gridmind-areas', "paint": { "line-color": 'white', "line-width": 7 } });
		MAPBOX.addLayer({ "id": 'gridmind-areas', "type": 'line', "source": 'gridmind-areas', "paint": { "line-color": '#98BC40', "line-width": 4 } });
	}

	// the priority layers are re-added on every analysis; stay above them
	MAPBOX.moveLayer('gridmind-areas-casing');
	MAPBOX.moveLayer('gridmind-areas');

	items.forEach((it, i) => {
		const [w, so, e, n] = geojsonExtent(it.feature);
		const el = ce('div', String(i + 1), { "class": 'gridmind-marker', "title": it.name });
		markers.push(new mapboxgl.Marker({ "element": el }).setLngLat([(w + e) / 2, (so + n) / 2]).addTo(MAPBOX));
	});

	MAPBOX.fitBounds(geojsonExtent(fc), { "padding": padding(), "duration": 1200 });
}

// Rank the administrative areas of a division with the analysis EAE just
// computed (priorityData, layerData) and return them for the chat.
async function areas(a) {
	const divs = GEOGRAPHY.divisions || [];
	let v = divs.findIndex((d, i) => i > 0 && d.name === a.division);
	if (v < 1) v = 1;

	const division = divs[v];
	if (!division) return null;

	// layers just turned on are still downloading
	await wait(() => STATE.datasets.every(d => !d.on || d.card || d.disabled));

	const before = division.layerData;
	const select = qs('#output-variant-select');
	select.value = v;
	select.dispatchEvent(new Event('change'));

	await wait(() => division.layerData && division.layerData !== before);

	// several commits can follow each other; wait until the result is stable
	let last = division.layerData;
	await wait(() => {
		if (division.layerData !== last) { last = division.layerData; return false; }
		return true;
	}, 3000, 1500);

	const priority = division.priorityData || {};
	let items = Object.keys(priority)
		.filter(id => priority[id].average > 0)
		.map(id => {
			const it = get_admin_area_item(v, id);
			if (!it) return null;
			const [, , raw] = get_admin_area_layer_data(v, id);
			return { ...it, "values": raw.values, "units": raw.units };
		})
		.filter(Boolean);

	const key = a.sort_by;
	const value = it => (key ? it.values[key] : it.priority);
	items = items
		.filter(it => typeof value(it) === 'number')
		.sort((x, y) => (a.order === 'asc' ? value(x) - value(y) : value(y) - value(x)))
		.slice(0, a.top || 5);

	if (!items.length) return { "text": `No ${division.name.toLowerCase()} match these filters. Try relaxing a range.`, "items": [] };

	highlight(items);

	const layers = STATE.datasets
		.filter(d => d.on && maybe(d, 'category', 'name') !== 'outline')
		.sort((x, y) => (x.id === key ? -1 : y.id === key ? 1 : 0))
		.slice(0, 3);

	return {
		"division": division.name,
		"by":       key ? (DST.get(key) || {}).name : 'priority',
		items,
		"rows":     items.map(it => ({
			"name":   it.name,
			"values": layers.map(d => `${d.name}: ${fmt(it.values[d.id], it.units[d.id])}`),
		})),
	};
}

function areas_html(res) {
	if (!res.items.length) return `<p>${escape(res.text)}</p>`;

	return `<div class="gridmind-areas-title">Top ${res.items.length} ${escape(res.division.toLowerCase())} by ${escape(res.by)}</div>
<ol class="gridmind-areas">${res.rows.map((r, i) => `<li data-i="${i}"><a>${escape(r.name)}</a><span>${r.values.map(escape).join(' · ')}</span></li>`).join('')}</ol>`;
}

const unit_of = ds => (['points', 'lines'].includes(ds.type) ? 'km' : (maybe(ds, 'category', 'unit') || ''));

// --- legend: what the colours and symbols on the map mean, read from the
// same colour scales the map and the cards draw with ---

const num = v => {
	if (typeof v !== 'number' || !isFinite(v)) return '?';
	return Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : (+v.toFixed(Math.abs(v) >= 10 ? 1 : 2)).toLocaleString();
};

const swatch = (color, shape = 'box') => `<i class="gridmind-swatch gridmind-swatch-${shape}" style="--c: ${escape(color || '#999')}"></i>`;

const scale_rows = rows => `<ul class="gridmind-scale">${rows.map(([color, label, note]) => `<li>${swatch(color)}<b>${escape(label)}</b>${note ? `<span>${escape(note)}</span>` : ''}</li>`).join('')}</ul>`;

function priority_legend() {
	const index = maybe(window.STATE, 'index') || 'eai';
	const labels = getScaleLabels(window.LOCALE);
	const stops = analysis_colorscale.stops;

	const rows = stops.map((c, i) => [
		c,
		labels[i] || '',
		`index ${(i * 0.2).toFixed(1)} – ${((i + 1) * 0.2).toFixed(1)}${i === 0 ? ', least suitable' : i === stops.length - 1 ? ', best match' : ''}`,
	]).reverse();

	return `<div class="gridmind-legend-block">
<div class="gridmind-legend-title">Priority heatmap · ${escape(INDEXES[index] || index)}</div>
<p>${escape(t(window.LOCALE, `modal.eae_info.index.${index}.explain`))}</p>
${scale_rows(rows)}
<p class="gridmind-legend-note">The colours compare places <b>within this analysis</b>: light yellow scores best on the layers you chose and their importance, dark purple scores lowest. Places with <b>no colour</b> fall outside a layer's range filter or have no data. Changing layers, ranges or importance redraws the colours.</p>
</div>`;
}

function value_rows(ds) {
	const host = ds.host || ds;
	const cs = host.colorscale;
	if (!cs || !cs.stops) return null;

	if (['raster-valued', 'raster-valued-mutant'].includes(ds.type)) {
		const table = maybe(host, 'csv', 'table') || {};
		return cs.stops.map((c, i) => [c, maybe(table, i) || `Class ${i + 1}`, '']);
	}

	const unit = unit_of(ds);
	let range = null;

	if (maybe(ds, 'raster', 'intervals') && cs.intervals)
		range = i => [cs.intervals[i], cs.intervals[i + 1]];
	else if (ds.fn && ds.fn.invert) {
		const s = uniform_split(cs.stops.length + 1);
		range = i => [ds.fn.invert(s[i]), ds.fn.invert(s[i + 1])];
	}

	return cs.stops.map((c, i) => {
		const r = range && range(i);
		const label = r && r.every(isFinite) ? `${num(r[0])} – ${num(r[1])}${unit ? ` ${unit}` : ''}` : (i === 0 ? 'Lowest values' : i === cs.stops.length - 1 ? 'Highest values' : '');
		return [c, label, i === 0 ? 'lowest' : i === cs.stops.length - 1 ? 'highest' : ''];
	}).reverse();
}

function layer_legend(ds) {
	const v = ds.vectors || {};
	const unit = unit_of(ds);
	const group = (maybe(ds, 'category', 'controls', 'path') || []).map(x => String(x).replace(/-/g, ' ')).join(' › ');
	let body = '';

	switch (ds.type) {
	case 'points':
	case 'points-timeline':
		body = `<p>${swatch(v.fill, 'dot')} Each <b>dot</b> marks one place from the ${escape(ds.name)} layer. In the analysis this layer is the <b>distance in km</b> to the nearest one.</p>`;
		break;

	case 'lines':
	case 'lines-timeline':
		body = `<p>${swatch(v.stroke, 'line')} Each <b>line</b> is part of the ${escape(ds.name)} layer. In the analysis this layer is the <b>distance in km</b> to the nearest line.</p>`;
		break;

	case 'polygons-boundaries':
		body = `<p>${swatch(v.stroke, 'outline')} The <b>outlines</b> are the borders of the ${escape(ds.name)}. They are for reference and do not change the priority colours.</p>`;
		break;

	case 'polygons':
		body = `<p>${swatch(v.fill, 'outline')} The <b>shaded shapes</b> are the areas of the ${escape(ds.name)} layer.</p>`;
		break;

	default: {
		const rows = value_rows(ds);
		body = rows
			? `<p>Each colour is a range of values${unit ? ` in <b>${escape(unit)}</b>` : ''}. It matches the colour bar on the layer's card (left = lowest, right = highest). From highest to lowest:</p>${scale_rows(rows)}`
			: `<p>This layer is a table and has no colours on the map.</p>`;
	}
	}

	const notes = [];
	const d = ds.domain, f = ds._domain;
	if (d && f && (f.min !== d.min || f.max !== d.max))
		notes.push(`Your range filter keeps only <b>${num(f.min)} – ${num(f.max)}${unit ? ` ${escape(unit)}` : ''}</b> (full range ${num(d.min)} – ${num(d.max)}). Places outside it get no priority colour.`);
	if (typeof ds.weight === 'number')
		notes.push(`Importance: <b>${ds.weight}/5</b>. Higher importance pulls the priority colours more towards this layer.`);

	return `<div class="gridmind-legend-block">
<div class="gridmind-legend-title">${escape(ds.name)}${group ? `<small>${escape(group)}</small>` : ''}</div>
${body}
${notes.map(n => `<p class="gridmind-legend-note">${n}</p>`).join('')}
</div>`;
}

async function legend(a) {
	const one = a.id ? DST.get(a.id) : null;

	const layers = one ? [one] : (maybe(window.STATE, 'datasets') || [])
		.filter(d => d.on && !d.disabled && maybe(d, 'category', 'name') !== 'outline');

	// a layer's colours are set up once its data has loaded
	await Promise.all(layers.filter(d => d.on).map(d => card_of(d, 20000)));

	const blocks = [];
	if (!one) blocks.push(priority_legend());

	for (const d of layers) {
		try { blocks.push(layer_legend(d)); }
		catch (e) { console.warn('GridMind legend failed for', d.id, e); }
	}

	if (!one && !layers.length)
		blocks.push(`<p class="gridmind-legend-note">No data layers are on yet. Add one and ask again to see what its colours mean.</p>`);

	return blocks.join('');
}

async function run(a) {
	const ds = a.id ? DST.get(a.id) : null;

	switch (a.type) {
	case 'activate':
	case 'deactivate': {
		const on = a.type === 'activate';
		const done = [];

		for (const id of a.ids || []) {
			const d = DST.get(id);
			if (!d || d.disabled || d.on === on) continue;

			d.turn(on);
			done.push(d.name);
		}

		return done.length ? `${on ? 'Turned on' : 'Turned off'} ${done.join(', ')}` : null;
	}

	case 'filter': {
		if (!ds || !(await card_of(ds))) return null;

		if (typeof a.min === 'number') ds._domain.min = a.min;
		if (typeof a.max === 'number') ds._domain.max = a.max;
		ds.card.values();

		const u = unit_of(ds);
		const parts = [];
		if (typeof a.min === 'number') parts.push(`min ${a.min} ${u}`);
		if (typeof a.max === 'number') parts.push(`max ${a.max} ${u}`);

		return `${ds.name}: ${parts.join(', ').trim()}`;
	}

	case 'weight': {
		if (!ds || !(await card_of(ds))) return null;

		ds.weight = a.weight;
		ds.card.values();

		return `${ds.name}: importance ${a.weight}/5`;
	}

	case 'index':
		return set_index(a.index) ? `Index: ${INDEXES[a.index]}` : null;

	case 'panel':
		open_tab(a.panel);
		return `Opened ${PANELS[a.panel] || a.panel}`;

	case 'results':
		open_right_panel();
		return 'Opened analysis results';

	case 'areas':
		return { "areas": await areas(a) };

	case 'legend':
		return { "legend": await legend(a) };

	case 'export':
		open_right_panel();
		setTimeout(_ => { const b = qs('#export-button'); if (b) b.click(); }, 400);
		return 'Opened export options';

	default:
		return null;
	}
}

// --- agent ---

async function ask(text) {
	const r = await fetch(CHAT_URL, {
		"method":  'POST',
		"headers": { "Content-Type": 'application/json' },
		"body":    JSON.stringify({ "message": text, "history": history.slice(-6), "context": context() }),
	});

	if (!r.ok) throw new Error(`GridMind agent answered ${r.status}`);

	return r.json();
}

async function health() {
	try {
		const r = await fetch(CHAT_URL.replace(/\/chat$/, '/health'), { "signal": AbortSignal.timeout(3000) });
		return await r.json();
	} catch {
		return null;
	}
}

// --- UI ---

function message(log, who, html) {
	const m = ce('div', null, { "class": `gridmind-msg gridmind-${who}` });
	m.innerHTML = html;

	log.append(m);
	log.scrollTop = log.scrollHeight;

	return m;
}

export function init() {
	const button = ce('button', `<i class="bi bi-chat-dots-fill"></i><span>GridMind</span>`, {
		"id":         'gridmind-button',
		"type":       'button',
		"title":      'GridMind assistant',
		"aria-label": 'Open GridMind assistant',
	});

	const panel = ce('section', null, { "id": 'gridmind-panel', "hidden": '', "aria-label": 'GridMind assistant' });

	const header = ce('header', `
<div>
  <div class="gridmind-title"><i class="bi bi-lightning-charge-fill"></i> GridMind</div>
  <div class="gridmind-status">Connecting…</div>
</div>
<button type="button" class="gridmind-close" aria-label="Close"><i class="bi bi-x-lg"></i></button>`);

	const status = qs('.gridmind-status', header);

	const log = ce('div', null, { "class": 'gridmind-log', "aria-live": 'polite' });

	const chips = ce('div', null, { "class": 'gridmind-chips' });
	for (const s of SUGGESTIONS) {
		const chip = ce('button', escape(s), { "type": 'button' });
		chip.addEventListener('click', _ => (s === LEGEND_QUESTION ? explain_legend() : send(s)));
		chips.append(chip);
	}

	const form = ce('form', null);
	const input = ce('input', null, { "type": 'text', "placeholder": 'Ask GridMind about this map…', "autocomplete": 'off', "aria-label": 'Message' });
	const submit = ce('button', `<i class="bi bi-send-fill"></i>`, { "type": 'submit', "aria-label": 'Send' });
	form.append(input, submit);

	panel.append(header, log, chips, form);
	document.body.append(button, panel);

	let busy = false;
	let greeted = false;
	let status_text = '';

	// While GridMind works, show it everywhere the user might look: a live
	// progress line (step + seconds) in the reply, the header and the button.
	function working(on) {
		busy = on;
		input.disabled = submit.disabled = on;
		input.placeholder = on ? 'GridMind is still working…' : 'Ask GridMind about this map…';
		panel.classList.toggle('gridmind-working', on);
		button.classList.toggle('gridmind-working', on);
		qs('span', button).textContent = on ? 'GridMind is thinking…' : 'GridMind';

		if (on) {
			status_text = status.textContent;
			status.textContent = 'Thinking…';
		}
		else status.textContent = status_text;
	}

	function progress(bubble) {
		const el = ce('div', `<span class="gridmind-spinner" aria-hidden="true"></span><span class="gridmind-step"></span><span class="gridmind-elapsed"></span>`, { "class": 'gridmind-progress', "role": 'status' });
		bubble.append(el);

		const t0 = Date.now();
		const secs = _ => Math.round((Date.now() - t0) / 1000);
		const tick = setInterval(_ => { qs('.gridmind-elapsed', el).textContent = `${secs()} s`; }, 1000);

		return {
			step(text) {
				qs('.gridmind-step', el).textContent = text;
				bubble.append(el); // stay below whatever was added last
				log.scrollTop = log.scrollHeight;
			},
			finish(ok = true) {
				clearInterval(tick);
				el.remove();
				bubble.append(ce('div', `<i class="bi bi-${ok ? 'check2-circle' : 'x-circle'}"></i> ${ok ? 'Finished' : 'Stopped'} in ${secs()} s`, { "class": 'gridmind-finished' }));
			},
		};
	}

	function doing(a) {
		const name = (a.id && DST.get(a.id)) ? DST.get(a.id).name : 'the layer';

		switch (a.type) {
		case 'activate':   return 'Turning on layers and loading their data';
		case 'deactivate': return 'Turning off layers';
		case 'filter':     return `Setting the ${name} range (waiting for its data)`;
		case 'weight':     return `Setting the importance of ${name}`;
		case 'index':      return 'Switching the prioritization index';
		case 'areas':      return 'Recalculating the analysis and ranking areas';
		case 'legend':     return 'Reading the colours and symbols on the map';
		default:           return 'Updating the map';
		}
	}

	// local: an answer prepared here (e.g. the legend button) instead of asking the agent
	async function send(text, local = null) {
		text = text.trim();
		if (!text || busy) return;

		working(true);
		input.value = '';
		chips.hidden = true;

		message(log, 'user', escape(text));

		const pending = message(log, 'bot', '');
		const p = progress(pending);
		p.step('Reading your question…');

		// the open-source model runs locally on the CPU and can take a while
		const slow = setTimeout(_ => p.step('Thinking with the open-source AI model on this computer. This can take up to a minute…'), 3000);

		let ok = true;

		try {
			const res = local || await ask(text);
			clearTimeout(slow);

			pending.prepend(ce('div', format(res.reply || ''), { "class": 'gridmind-reply' }));

			history.push({ "role": 'user', "content": text });
			history.push({ "role": 'assistant', "content": res.reply || '' });

			// filters and weights wait for the layer's data, so list each
			// action as soon as it is applied
			const done = ce('ul', null, { "class": 'gridmind-done', "hidden": '' });
			pending.append(done);

			const actions = res.actions || [];

			for (const [i, a] of actions.entries()) {
				p.step(`${doing(a)}${actions.length > 1 ? ` (step ${i + 1} of ${actions.length})` : ''}…`);

				try {
					const d = await run(a);
					if (!d) continue;

					if (d.legend) {
						pending.append(ce('div', d.legend, { "class": 'gridmind-legend' }));
						continue;
					}

					if (d.areas) {
						const box = ce('div', areas_html(d.areas), { "class": 'gridmind-areas-box' });
						pending.append(box);

						for (const li of box.querySelectorAll('li')) {
							const it = d.areas.items[+li.dataset.i];
							li.addEventListener('click', _ => MAPBOX.fitBounds(geojsonExtent(it.feature), { "padding": padding(), "duration": 1000 }));
						}

						if (d.areas.items.length)
							history.push({ "role": 'assistant', "content": `Top ${d.areas.division}: ${d.areas.rows.map((r, i) => `${i + 1}. ${r.name} (${r.values.join(', ')})`).join('; ')}` });

						continue;
					}

					done.hidden = false;
					done.append(ce('li', `<i class="bi bi-check2"></i> ${escape(d)}`));
				} catch (e) {
					console.warn('GridMind action failed', a, e);
				}
			}
		} catch (e) {
			clearTimeout(slow);
			ok = false;
			pending.prepend(ce('div', `I can't reach the GridMind agent (${escape(e.message)}). Start it with <code>node server.js</code> in <code>GridMind/agent</code>.`, { "class": 'gridmind-reply' }));
			pending.classList.add('gridmind-error');
		}

		p.finish(ok);
		working(false);
		if (!panel.hidden) input.focus();
		log.scrollTop = log.scrollHeight;
	};

	// The legend is built from the map itself, so it works even when the agent is offline.
	const explain_legend = _ => send(LEGEND_QUESTION, {
		"reply":   'Here is what the colours and symbols on your map mean:',
		"actions": [{ "type": 'legend' }],
	});

	const ramp = qs('#output-ramp');
	if (ramp) {
		const help = ce('button', `<i class="bi bi-question-circle"></i> What do these colours mean?`, { "type": 'button', "id": 'gridmind-legend-help' });
		help.addEventListener('click', _ => { toggle(true); explain_legend(); });
		ramp.after(help);
	}

	form.addEventListener('submit', e => { e.preventDefault(); send(input.value); });

	async function toggle(open) {
		panel.hidden = !open;
		button.hidden = open;
		if (!open) return;

		input.focus();

		if (!greeted) {
			greeted = true;
			const g = maybe(window.GEOGRAPHY, 'name');
			message(log, 'bot', `Hi, I'm <strong>GridMind</strong>. I can set up priority maps for grid extension, mini-grids or stand-alone solar${g ? ` in <strong>${escape(g)}</strong>` : ''}, explain the data, and help you export a report. What would you like to do?`);
		}

		const h = await health();
		if (!h) status.textContent = 'Agent offline';
		else if (h.llm) status.textContent = `Open-source AI · ${h.model}`;
		else status.textContent = 'Guided mode (AI model offline)';
	};

	button.addEventListener('click', _ => toggle(true));
	qs('.gridmind-close', header).addEventListener('click', _ => toggle(false));

};
