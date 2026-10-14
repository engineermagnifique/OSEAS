// Helpers over the layer catalog the browser sends with each question:
// [{ id, name, category, path, unit, type, domain, on }]

// Roles the recipes need, matched against category name, id and name.
// Census indicators (category "indicator") are excluded so that e.g. "KHS
// Cooking Fuel Electricity Minigrid" is not mistaken for a mini-grid layer.
const ROLES = {
	"population":  { "re": /population/i },
	"nightlights": { "re": /night-?time-?lights|nightlights/i },
	"ghi":         { "re": /^ghi|ghi\b|irradiation/i },
	"wind":        { "re": /wind/i },
	"grid":        { "re": /transmission|distribution-lines|^distribution$|power-?lines|grid-lines|existing-grid/i, "types": ['lines'] },
	"planned":     { "re": /planned/i, "types": ['lines'] },
	"substations": { "re": /substation/i },
	"minigrids":   { "re": /mini-?grid/i, "types": ['points', 'polygons'] },
	"health":      { "re": /health/i },
	"schools":     { "re": /school|education/i },
	"crops":       { "re": /crop/i, "prefer": /lc-class-crops|crop cover|^crops?$/i },
	"mines":       { "re": /mine|mineral/i },
	// share of households with electricity: a census indicator, so census is allowed
	"access":      { "re": /lighting[- ]electricity|electricity access|electrification|access to electricity/i, "census": true, "prefer": /^county/i },
};

// questions about energy access pull the census electricity indicators into the prompt
const ACCESS_QUESTION = /access|accès|electrif|électrif|electricity|électricité|umeme|connected|unserved|energy poverty|without power|no power/i;

const is_census = d => d.category === 'indicator' || /^census/.test(d.path || '');

function haystack(d) {
	return `${d.category} ${d.id} ${d.name}`;
}

export function find_role(catalog, role) {
	const r = ROLES[role];
	if (!r) return null;

	const hits = catalog
		.filter(d => r.census || !is_census(d))
		.filter(d => r.re.test(haystack(d)))
		.filter(d => !r.types || r.types.includes(d.type));

	if (r.prefer) {
		const best = hits.find(d => r.prefer.test(d.category) || r.prefer.test(d.id) || r.prefer.test(d.name));
		if (best) return best;
	}

	// "grid" must not pick up planned lines when existing ones are present
	if (role === 'grid') {
		const existing = hits.filter(d => !/planned/i.test(haystack(d)));
		return existing[0] || hits[0] || null;
	}

	return hits[0] || null;
}

export function roles(catalog) {
	const out = {};
	for (const k of Object.keys(ROLES)) out[k] = find_role(catalog, k);
	return out;
}

const STOP = new Set(['the', 'and', 'with', 'for', 'are', 'area', 'areas', 'show', 'where', 'which', 'what', 'most', 'low', 'high', 'near', 'far', 'from', 'that', 'have', 'has', 'more', 'less', 'than', 'map', 'data', 'layer', 'layers', 'county', 'counties', 'subcounty', 'kenya', 'energy', 'many', 'people', 'places', 'parts', 'only', 'keep', 'find', 'make', 'into', 'this', 'there', 'they', 'their']);

const words = s => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w));

// The catalog can hold 100+ layers. CPU inference reads the prompt at a few
// dozen tokens per second, so send only: layers already on, the demand/supply
// planning layers, the recipe roles, and layers the question names.
export function relevant(catalog, question) {
	const q = new Set(words(question));
	const role_ids = new Set(Object.values(roles(catalog)).filter(Boolean).map(d => d.id));
	const access = ACCESS_QUESTION.test(question);

	return catalog.filter(d => {
		if (d.category === 'outline') return false;
		if (d.on) return true;
		if (d.id === roles(catalog).access?.id) return access;
		if (role_ids.has(d.id)) return true;
		if (!is_census(d) && /^(demand|supply)\//.test(d.path || '')) return true;
		if (access && ROLES.access.re.test(haystack(d))) return true;
		return words(d.name).some(w => q.has(w));
	});
}

function range(d) {
	if (!d.domain || d.domain.min === undefined) return '';
	const unit = (d.type === 'points' || d.type === 'lines') ? 'km distance' : (d.unit || '');
	return `${d.domain.min}-${d.domain.max} ${unit}`.trim();
}

export function compact(list) {
	return list
		.map(d => `${d.id} | ${d.name} | ${d.path || d.category} | ${range(d)}${d.on ? ' | ON' : ''}`)
		.join('\n');
}
