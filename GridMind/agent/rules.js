// Rule-based intent engine. Used when no LLM is reachable, and as the baseline
// in eval.js. Returns the same shape as the LLM: { intent, reply, actions }.

import { roles } from './catalog.js';

const INDEXES = {
	"eai":    'Energy Access Potential',
	"demand": 'Demand Index',
	"supply": 'Supply Index',
	"ani":    'Assistance Need Index',
};

const has = (q, ...words) => words.some(w => q.includes(w));

// words users say -> catalog role (see catalog.js)
const LAYER_WORDS = {
	"population":  ['population', 'people'],
	"nightlights": ['nightlight', 'night light', 'nighttime'],
	"ghi":         ['ghi', 'solar potential', 'irradiation', 'solar resource'],
	"wind":        ['wind'],
	"grid":        ['grid', 'power line', 'distribution line', 'transmission'],
	"substations": ['substation'],
	"health":      ['health', 'clinic', 'hospital'],
	"schools":     ['school'],
	"crops":       ['crop'],
	"mines":       ['mine', 'mineral'],
};

function mentioned(q, r) {
	return Object.entries(LAYER_WORDS)
		.filter(([, ws]) => ws.some(w => q.includes(w)))
		.map(([role]) => r[role])
		.filter(Boolean);
}

// Ordered: the first matching intent wins, so specific ones come first.
const INTENTS = [
	["explain_legend", q => has(q, 'legend', 'colour', 'color', 'shade', 'purple', 'yellow', 'symbol', 'what does the map show', 'what am i looking at', 'read the map', 'légende', 'couleur', 'rangi')],
	["switch_index", q => has(q, 'switch', 'change', 'use ', 'set ') && has(q, 'index', 'demand index', 'supply index', 'assistance', 'potential')],
	["minigrid", q => has(q, 'mini-grid', 'minigrid', 'mini grid', 'microgrid', 'micro-grid', 'micro grid')],
	["standalone", q => has(q, 'stand-alone', 'standalone', 'stand alone', 'solar home', 'off-grid', 'off grid', 'shs', 'solar kit')],
	["grid", q => has(q, 'grid extension', 'extend the grid', 'densif', 'connect to the grid', 'grid connection', 'existing grid')],
	["report", q => has(q, 'report', 'export', 'download', 'pptx', 'powerpoint')],
	["results", q => has(q, 'result', 'high priority', 'high-priority', 'top areas', 'best areas')],
	["find_areas", q => has(q, 'most populated', 'densely populated', 'populated', 'low access', 'no access', 'lowest electricity', 'electricity access', 'without electricity', 'unelectrified', 'lack of electricity', 'least electrified', 'which counties', 'which districts', 'which regions', 'top areas', 'top 5', 'top five')],
	["priority_map", q => has(q, 'priority', 'prioriti', 'analysis', 'analyse', 'analyze', 'heatmap', 'where should')],
	["layer_control", q => /\b(turn on|turn off|switch on|switch off|show|hide|add|remove|enable|disable|activate|deactivate|display)\b/.test(q) && Object.values(LAYER_WORDS).flat().some(w => q.includes(w))],
	["explain_index", q => has(q, 'index', 'indexes', 'indices', 'eai', ' ani')],
	["explain_population", q => has(q, 'population', 'demograph', 'people')],
	["explain_productive", q => has(q, 'nightlight', 'night light', 'nighttime', 'crop', 'productive', 'health', 'school', 'mine')],
	["explain_resources", q => has(q, 'ghi', 'solar', 'irradiation', 'wind', 'resource')],
	["explain_infrastructure", q => has(q, 'grid', 'transmission', 'distribution', 'substation', 'infrastructure')],
	["geography", q => has(q, 'country', 'geograph', 'region', 'district', 'county', 'boundar')],
	["layers_status", q => has(q, 'layer', 'dataset', 'what is on', 'active')],
	["greeting", q => /^\s*(hi|hello|hey|good (morning|afternoon|evening))\b/.test(q) || has(q, 'help', 'what can you do')],
];

export function classify(text) {
	const q = ` ${text.toLowerCase().trim()} `;
	for (const [name, test] of INTENTS)
		if (test(q)) return name;
	return 'unknown';
}

function activate(...layers) {
	const ids = layers.filter(Boolean).map(d => d.id);
	return ids.length ? [{ "type": 'activate', ids }] : [];
}

const names = (...layers) => layers.filter(Boolean).map(d => d.name).join(', ');

function missing(r, ...keys) {
	const m = keys.filter(k => !r[k]);
	return m.length ? ` This geography has no ${m.join(' / ')} layer, so I skipped it.` : '';
}

export function respond(text, context = {}) {
	const intent = classify(text);
	const catalog = context.catalog || [];
	const r = roles(catalog);
	const where = context.geography ? ` in ${context.geography}` : '';
	const current = INDEXES[context.index] || 'Energy Access Potential';

	switch (intent) {
	case 'minigrid': {
		const actions = [
			...activate(r.population, r.nightlights || r.health, r.ghi, r.grid, r.minigrids),
			...(r.grid ? [{ "type": 'filter', "id": r.grid.id, "min": 15 }] : []),
			...(r.ghi ? [{ "type": 'weight', "id": r.ghi.id, "weight": 4 }] : []),
			{ "type": 'index', "index": 'eai' },
			{ "type": 'panel', "panel": 'cards' },
		];

		return { intent, actions, "reply": `Mini-grid screening${where}: I turned on ${names(r.population, r.nightlights || r.health, r.ghi, r.grid, r.minigrids)}.${r.grid ? ' Areas within 15 km of the grid are filtered out.' : ''} GHI has high importance and the index is Energy Access Potential. High-priority areas are dense, active settlements far from the grid.${missing(r, 'population', 'ghi', 'grid')}` };
	}

	case 'standalone': {
		const actions = [
			...activate(r.population, r.ghi, r.grid),
			...(r.grid ? [{ "type": 'filter', "id": r.grid.id, "min": 25 }] : []),
			{ "type": 'index', "index": 'ani' },
			{ "type": 'panel', "panel": 'cards' },
		];

		return { intent, actions, "reply": `Stand-alone solar PV${where}: I turned on ${names(r.population, r.ghi, r.grid)}, kept only areas more than 25 km from the grid, and switched to the Assistance Need Index, which highlights high need with low access to infrastructure.${missing(r, 'population', 'ghi', 'grid')}` };
	}

	case 'grid': {
		const actions = [
			...activate(r.population, r.nightlights, r.grid, r.substations),
			...(r.grid ? [{ "type": 'filter', "id": r.grid.id, "max": 5 }] : []),
			{ "type": 'index', "index": 'eai' },
			{ "type": 'panel', "panel": 'cards' },
		];

		return { intent, actions, "reply": `Grid extension${where}: I turned on ${names(r.population, r.nightlights, r.grid, r.substations)} and kept only areas within 5 km of the existing grid. The index is Energy Access Potential.${missing(r, 'population', 'grid')}` };
	}

	case 'report':
		return { intent, "actions": [{ "type": 'export' }], "reply": 'I opened the export dialog. You can download a PowerPoint report, the analysis as TIFF, or the priority areas as CSV. Build the analysis first so the report has content.' };

	case 'results':
		return { intent, "actions": [{ "type": 'results' }], "reply": 'I opened the analysis results: the right panel lists the high-priority areas and charts for the current layers.' };

	case 'priority_map':
		return { intent, "actions": [{ "type": 'panel', "panel": 'controls' }], "reply": `To build a priority map${where}: 1) In Add Layers, pick Demand layers (population, nighttime lights, productive uses) and Supply layers (GHI, grid). 2) In Active Layers, set each layer's range and importance. 3) Choose the index (now ${current}). 4) Open Show Analysis Results. Or tell me the intervention (grid, mini-grid or stand-alone PV) and I'll set it up.` };

	case 'layer_control': {
		const q = text.toLowerCase();
		const layers = mentioned(q, r);
		const off = /\b(turn off|switch off|hide|remove|disable|deactivate)\b/.test(q);

		if (!layers.length)
			return { intent, "actions": [{ "type": 'panel', "panel": 'controls' }], "reply": 'That layer is not available for this geography. I opened Add Layers so you can browse what exists.' };

		return { intent, "actions": [{ "type": off ? 'deactivate' : 'activate', "ids": layers.map(d => d.id) }], "reply": `${off ? 'Turned off' : 'Turned on'} ${names(...layers)}.` };
	}

	case 'find_areas': {
		const q = text.toLowerCase();
		const low_access = has(q, 'access', 'without electricity', 'unelectrified', 'lack of electricity', 'least electrified', 'lowest electricity');
		const populated = has(q, 'populated', 'population', 'people', 'dense');
		const division = (context.divisions || [])[0];
		const actions = [];
		const used = [];

		if (populated && r.population) { actions.push(...activate(r.population)); used.push(r.population.name); }

		if (low_access && r.access) {
			actions.push(...activate(r.access), { "type": 'filter', "id": r.access.id, "max": 30 });
			used.push(`${r.access.name} (at most 30%)`);
		} else if (low_access && r.nightlights) {
			actions.push(...activate(r.nightlights), { "type": 'filter', "id": r.nightlights.id, "max": 10 });
			used.push(`${r.nightlights.name} (dark areas)`);
		}

		const sort = populated && r.population ? r.population : (low_access && r.access ? r.access : null);
		const order = sort && sort === r.access ? 'asc' : 'desc';
		actions.push({ "type": 'areas', "top": 5, ...(division ? { division } : {}), ...(sort ? { "sort_by": sort.id, order } : {}) });

		return { intent, actions, "reply": `I turned on ${used.join(' and ') || 'the relevant layers'} and ranked the ${(division || 'areas').toLowerCase()}${sort ? ` by ${sort.name}` : ' by priority'}. The top areas are listed below and highlighted on the map.` };
	}

	case 'switch_index': {
		const q = text.toLowerCase();
		const index = q.includes('demand') ? 'demand' : q.includes('supply') ? 'supply' : (q.includes('assistance') || q.includes('need')) ? 'ani' : 'eai';
		return { intent, "actions": [{ "type": 'index', index }], "reply": `Switched the prioritization index to ${INDEXES[index]}.` };
	}

	case 'explain_legend': {
		// the map builds the legend itself from what is on screen
		const [layer] = mentioned(` ${text.toLowerCase()} `, r);
		return { intent, "actions": [{ "type": 'legend', ...(layer ? { "id": layer.id } : {}) }], "reply": layer ? `Here is how to read the ${layer.name} layer on the map:` : 'Here is what the colours and symbols on your map mean:' };
	}

	case 'explain_index':
		return { intent, "actions": [], "reply": `EAE has four indexes. Energy Access Potential combines demand and supply (the recommended default). Demand Index uses demographics and social/productive uses. Supply Index uses resources and infrastructure. Assistance Need Index highlights high need, low economic activity and low access to infrastructure. Current: ${current}.` };

	case 'explain_population':
		return { intent, "actions": [], "reply": `Population is a Demand layer (demographics) showing where people live, the main driver of energy demand.${r.population ? ` Say "turn on population" to add ${r.population.name}.` : ' It is not available for this geography.'}` };

	case 'explain_productive':
		return { intent, "actions": [{ "type": 'panel', "panel": 'controls' }], "reply": 'Social and productive uses are Demand layers: nighttime lights (a proxy for existing electricity use), health facilities, schools, crops and mines. They show where energy services are needed. I opened Add Layers.' };

	case 'explain_resources':
		return { intent, "actions": [], "reply": `Resource availability is a Supply layer group. GHI (Global Horizontal Irradiation, kWh/m²) shows solar potential: higher GHI means more output per panel.${r.ghi ? ` Say "turn on GHI" to add ${r.ghi.name}.` : ''}` };

	case 'explain_infrastructure':
		return { intent, "actions": [], "reply": `Infrastructure is a Supply layer group: transmission and distribution lines, substations and mini-grids. For these layers the filter is the distance in km to the nearest feature.${r.grid ? ` Say "turn on the grid" to add ${r.grid.name}.` : ''}` };

	case 'geography':
		return { intent, "actions": [{ "type": 'panel', "panel": 'geographies' }], "reply": 'Use Change Geographies to focus the analysis on a sub-region. I opened it.' };

	case 'layers_status': {
		const on = (context.layers || []);
		return { intent, "actions": [{ "type": 'panel', "panel": on.length ? 'cards' : 'controls' }], "reply": on.length ? `Active layers: ${on.join(', ')}.` : 'No layers are on yet. I opened Add Layers.' };
	}

	case 'greeting':
		return { intent, "actions": [], "reply": `Hi, I'm GridMind. I can set up priority maps for grid extension, mini-grids or stand-alone solar PV${where}, explain the datasets and indexes, and help you export a report. What would you like to do?` };

	default:
		return { intent, "actions": [], "reply": 'I can help with priority maps for grid, mini-grid or stand-alone PV, explain datasets (population, nighttime lights, crops, GHI, grid) and indexes, or export a report. Could you rephrase?' };
	}
}
