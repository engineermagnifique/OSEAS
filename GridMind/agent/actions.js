// Validate actions against the catalog before they reach the map: drop unknown
// ids (models sometimes invent them), clamp weights and filter ranges, and
// make sure a layer is activated before it is filtered or weighted.

const INDEXES = ['eai', 'demand', 'supply', 'ani'];
const PANELS = ['cards', 'controls', 'geographies', 'vectors', 'locations'];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function validate(actions, catalog = [], divisions = []) {
	const byid = new Map(catalog.map(d => [d.id, d]));
	const activated = new Set(catalog.filter(d => d.on).map(d => d.id));
	const out = [];

	const ensure_on = id => {
		if (activated.has(id)) return;
		out.push({ "type": 'activate', "ids": [id] });
		activated.add(id);
	};

	for (const a of actions || []) {
		if (!a || typeof a !== 'object') continue;

		switch (a.type) {
		case 'activate':
		case 'deactivate': {
			const ids = [...new Set((a.ids || (a.id ? [a.id] : [])).filter(id => byid.has(id)))];
			if (!ids.length) break;

			if (a.type === 'activate') ids.forEach(id => activated.add(id));
			else ids.forEach(id => activated.delete(id));

			out.push({ "type": a.type, ids });
			break;
		}

		case 'filter': {
			const d = byid.get(a.id);
			if (!d || !d.domain) break;

			const f = { "type": 'filter', "id": d.id };
			const { min, max } = d.domain;
			if (typeof a.min === 'number') f.min = clamp(a.min, Math.min(min, max), Math.max(min, max));
			if (typeof a.max === 'number') f.max = clamp(a.max, Math.min(min, max), Math.max(min, max));
			if (f.min === undefined && f.max === undefined) break;
			if (f.min !== undefined && f.max !== undefined && f.min > f.max) break;

			ensure_on(d.id);
			out.push(f);
			break;
		}

		case 'weight': {
			const d = byid.get(a.id);
			if (!d || typeof a.weight !== 'number') break;

			ensure_on(d.id);
			out.push({ "type": 'weight', "id": d.id, "weight": clamp(Math.round(a.weight), 1, 5) });
			break;
		}

		case 'index':
			if (INDEXES.includes(a.index)) out.push({ "type": 'index', "index": a.index });
			break;

		case 'panel':
			if (PANELS.includes(a.panel)) out.push({ "type": 'panel', "panel": a.panel });
			break;

		case 'areas': {
			const f = { "type": 'areas', "top": clamp(Math.round(+a.top || 5), 1, 15), "order": a.order === 'asc' ? 'asc' : 'desc' };

			const div = divisions.find(d => d.toLowerCase() === String(a.division || '').toLowerCase());
			if (div) f.division = div;

			if (a.sort_by && byid.has(a.sort_by)) {
				ensure_on(a.sort_by);
				f.sort_by = a.sort_by;
			}

			out.push(f);
			break;
		}

		case 'legend':
			out.push(byid.has(a.id) ? { "type": 'legend', "id": a.id } : { "type": 'legend' });
			break;

		case 'results':
		case 'export':
			out.push({ "type": a.type });
			break;
		}
	}

	return out;
}
