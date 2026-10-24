/*
 * thermo-orb-card  v3.1.7 (Sfera adattiva)
 * Panoramica climatica con orb 3D.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const TAU = Math.PI * 2;

const parseColor = (v, def) => {
  if (Array.isArray(v) && v.length >= 3) return v.slice(0, 3).map((n) => clamp(Math.round(+n) || 0, 0, 255));
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d+\s*,\s*\d+\s*,\s*\d+$/.test(s)) return s.split(',').map((x) => clamp(+x, 0, 255));
    let h = s.replace('#', '');
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h, 16);
    if (h.length === 6 && !Number.isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return def;
};

const normEnt = (e) => (typeof e === 'string' ? { entity: e } : e);
const idOf = (e) => (typeof e === 'string' ? e : e.entity);
// Stable comparison prevents HA's config echo from rebuilding the editor after each field selection.
const stableStringify = (value) => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.keys(item).sort().reduce((sorted, key) => { sorted[key] = item[key]; return sorted; }, {})
    : item
);

const LAYOUTS = [
  { value: 'select', label: 'Selezionabile (una stanza alla volta)' },
  { value: 'grid', label: 'Affiancate (tutte in griglia)' },
];
const roomGridCols = (c) => (c.room_columns ? `repeat(${Number(c.room_columns)}, minmax(0, 1fr))` : 'repeat(auto-fit, minmax(min(100%, 290px), 1fr))');

const CHIP_CSS = `
  .rchips { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px; margin: 0 -2px 10px; }
  .rchips::-webkit-scrollbar { display: none; }
  .rchips:empty, .rdev:empty { display: none; }
  .rdev { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 2px; margin: 0 -2px 8px; }
  .rdev::-webkit-scrollbar { display: none; }
  .rchip { flex: none; display: inline-flex; align-items: center; gap: 7px; border: 0; font: inherit; font-size: .85rem; font-weight: 600; cursor: pointer; --mdc-icon-size: 18px;
    padding: 8px 14px; border-radius: 999px; color: var(--primary-text-color); background: color-mix(in srgb, var(--primary-text-color) 9%, transparent); transition: background .25s, box-shadow .25s; }
  .rdev .rchip { font-size: .8rem; padding: 6px 12px; }
  /* Nomi delle entità in modalità selezione: vanno a capo invece di creare una riga scorrevole */
  .rdev { flex-wrap: wrap !important; overflow-x: visible !important; }
  .rdev .rchip { flex: 0 1 auto !important; min-width: 0; max-width: 100%; text-align: left; line-height: 1.2; }
  .rchip.sel { background: color-mix(in srgb, var(--acc, #00b0ff) 24%, transparent); box-shadow: inset 0 0 0 1.5px var(--acc, #00b0ff); }
  .rchip .bd { font-size: .72rem; font-weight: 700; min-width: 18px; text-align: center; padding: 1px 6px; border-radius: 999px; background: color-mix(in srgb, var(--primary-text-color) 14%, transparent); }
  .rchip .lv { width: 8px; height: 8px; border-radius: 50%; background: var(--acc, #00b0ff); box-shadow: 0 0 8px var(--acc, #00b0ff); animation: rblink 1.4s ease-in-out infinite; }
  @keyframes rblink { 50% { opacity: .3; } }
  .rchip:focus-visible { outline: 2px solid var(--acc, #00b0ff); outline-offset: 2px; }
  .rhd { display: flex; align-items: center; gap: 8px; padding: 0 4px 8px; font-weight: 700; font-size: .98rem; color: var(--primary-text-color); --mdc-icon-size: 20px; }
  .rhd .rn { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .room.panel { background: color-mix(in srgb, var(--primary-text-color) 5%, transparent); border-radius: 20px; padding: 12px 10px 10px; }
  @media (prefers-reduced-motion: reduce) { .rchip .lv { animation: none; } }
`;

function chipsInto(el, items, selId, onPick) {
  el.innerHTML = items.length > 1
    ? items.map((i) => `<button class="rchip ${i.id === selId ? 'sel' : ''}" data-id="${esc(i.id)}">${i.icon ? `<ha-icon icon="${esc(i.icon)}"></ha-icon>` : ''}${i.live ? '<span class="lv"></span>' : ''}${esc(i.label)}${i.badge != null && i.badge !== '' ? `<span class="bd">${esc(i.badge)}</span>` : ''}</button>`).join('')
    : '';
  el.querySelectorAll('.rchip').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.id)));
}

const EDITOR_CSS = `
  :host { display: block; }
  .sh { font-weight: 700; margin: 18px 0 4px; font-size: 1rem; color: var(--primary-text-color); }
  .hint { font-size: .82rem; color: var(--secondary-text-color); margin: 0 0 8px; }
  .room { border: 1px solid var(--divider-color, rgba(127,127,127,.35)); border-radius: 14px; padding: 8px 12px 6px; margin: 10px 0; background: var(--secondary-background-color, rgba(127,127,127,.08)); }
  .rh { display: flex; align-items: center; gap: 8px; padding: 2px 0 6px; }
  .idx { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: .8rem; font-weight: 700; color: #fff; background: var(--primary-color, #03a9f4); }
  .rn { font-weight: 600; color: var(--primary-text-color); }
  .sp { flex: 1; }
  .rh button, .add { border: 0; font: inherit; cursor: pointer; color: var(--primary-text-color); background: color-mix(in srgb, var(--primary-text-color) 10%, transparent); }
  .rh button { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; --mdc-icon-size: 20px; }
  .rh button[disabled] { opacity: .3; cursor: default; }
  .rh button[data-a=del] { color: var(--error-color, #db4437); }
  .add { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 999px; font-weight: 600; --mdc-icon-size: 20px; margin-top: 4px; }
  .loose-order { margin: 8px 0 16px; }
  .loose-order .loose-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--divider-color, rgba(127,127,127,.25)); border-radius: 10px; margin: 5px 0; }
  .loose-order .loose-name { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: .86rem; }
  .loose-order button { width: 32px; height: 32px; border: 0; border-radius: 50%; cursor: pointer; color: var(--primary-text-color); background: color-mix(in srgb, var(--primary-text-color) 10%, transparent); }
  .loose-order button:disabled { opacity: .3; cursor: default; }
  .loose-sensors { margin: 8px 0 16px; }
  .loose-sensor-item { border: 1px solid var(--divider-color, rgba(127,127,127,.25)); border-radius: 10px; padding: 8px 10px; margin: 7px 0; }
  .loose-sensor-title { font-size: .86rem; font-weight: 600; margin-bottom: 5px; overflow-wrap: anywhere; }
`;

function makeRoomsEditor(o) {
  const L = {
    layout: 'Visualizzazione',
    room_columns: 'Stanze per riga (vuoto = automatico)',
    orb_columns: 'Orb per riga in questa stanza (vuoto = 1)',
    entity_columns: 'Entità senza stanza per riga',
    entities: o.looseLabel || 'Dispositivi senza stanza (opzionale)',
    name: 'Nome stanza',
    icon: 'Icona',
    ...o.labels,
  };
  const roomSchema = [
    { name: 'name', selector: { text: {} } },
    { name: 'icon', selector: { icon: {} } },
    ...(o.roomExtra || []),
    { name: 'entities', selector: { entity: { multiple: true, domain: o.domains } } },
  ];
  const genSchema = [...o.schema, { name: 'entities', selector: { entity: { multiple: true, domain: o.domains } } }];
  const genSchemaNames = new Set(genSchema.flatMap((f) => (f.type === 'grid' ? f.schema.map((x) => x.name) : [f.name])));
  const roomKeys = ['name', 'icon', ...(o.roomExtra || []).map((f) => f.name)];
  const empty = (v) => v === '' || v == null || (typeof v === 'number' && !Number.isFinite(v));

  return class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._gen = {};
      this._loose = [];
      this._rooms = [];
      this._last = '';
    }

    setConfig(config) {
      const j = stableStringify(config || {});
      if (j === this._last && this._drawn) return;
      const { rooms, entities, loose_sensors, ...rest } = JSON.parse(j);
      const sensorMap = loose_sensors && typeof loose_sensors === 'object' ? loose_sensors : {};
      // Keep entity IDs in the standard HA entity selector and persist sensor
      // associations separately. HA form controls normalize `entities` to an
      // array of strings, so nesting temperature/humidity inside those entries
      // can be silently discarded during the next config round-trip.
      const incomingLoose = (entities || []).map((item) => {
        const base = normEnt(item) || {};
        const id = idOf(base);
        const mapped = sensorMap[id] && typeof sensorMap[id] === 'object' ? sensorMap[id] : {};
        const next = { ...base, entity: id };
        ['temperature_entity', 'humidity_entity'].forEach((key) => {
          const value = Object.prototype.hasOwnProperty.call(mapped, key) ? mapped[key] : base[key];
          if (value) next[key] = value;
          else delete next[key];
        });
        return next;
      });
      const incomingRooms = (rooms || []).map((r) => ({ ...r, entities: r.entities || [] }));

      // Avoid rebuilding controls for HA's config echo, but only when the
      // complete loose sensor mapping also matches. If it differs, accept it.
      const sameLooseIds = this._drawn && incomingLoose.length === this._loose.length &&
        incomingLoose.every((item, index) => idOf(item) === idOf(this._loose[index]));
      const sameLooseData = this._drawn && stableStringify(incomingLoose) === stableStringify(this._loose);
      const sameRooms = this._drawn && stableStringify(incomingRooms) === stableStringify(this._rooms);
      if (sameLooseIds && sameLooseData && sameRooms) {
        this._gen = rest;
        this._last = j;
        return;
      }

      this._last = j;
      this._gen = rest;
      this._loose = incomingLoose;
      this._rooms = incomingRooms;
      this._draw();
    }

    set hass(h) {
      this._hass = h;
      this.shadowRoot.querySelectorAll('ha-form').forEach((f) => {
        f.hass = h;
      });
    }

    _draw() {
      const r = this.shadowRoot;
      r.innerHTML = `<style>${EDITOR_CSS}</style><div class="gen"></div><div class="xtra"></div><div class="loose-sensors"></div>
        <div class="sh">Stanze</div><p class="hint">Crea le stanze e mettile nell'ordine che preferisci con le frecce.</p>
        <div class="rooms"></div>
        <button class="add" type="button"><ha-icon icon="mdi:plus"></ha-icon>Aggiungi stanza</button>`;
      const gen = document.createElement('ha-form');
      gen.computeLabel = (s) => L[s.name] || s.name;
      gen.hass = this._hass;
      gen.schema = genSchema;
      const dflt = typeof o.defaults === 'function' ? o.defaults({ ...this._gen, rooms: this._rooms }) : o.defaults || {};
      gen.data = { ...dflt, ...this._gen, entities: this._loose.map(idOf) };
      gen.addEventListener('value-changed', (e) => this._genChanged(e));
      r.querySelector('.gen').appendChild(gen);
      this._drawLooseOrder();
      this._drawLooseSensors();
      r.querySelector('.add').addEventListener('click', () => {
        this._rooms.push({ name: `Stanza ${this._rooms.length + 1}`, entities: [], orb_columns: 1 });
        this._emit();
        this._drawRooms();
      });
      this._drawRooms();
      this._drawn = true;
    }

    _drawLooseSensors() {
      const box = this.shadowRoot.querySelector('.loose-sensors');
      if (!box) return;
      if (!this._loose.length) { box.innerHTML = ''; return; }
      box.innerHTML = `<div class="sh">Sensori per le entità senza stanza</div><p class="hint">Associa temperatura e umidità direttamente a ogni Orb. Queste associazioni funzionano anche quando non usi le stanze.</p><div class="loose-sensor-list"></div>`;
      const list = box.querySelector('.loose-sensor-list');
      const sensorFields = [
        { key: 'temperature_entity', label: 'Sensore temperatura' },
        { key: 'humidity_entity', label: 'Sensore umidità' },
      ];
      this._loose.forEach((item, i) => {
        const id = idOf(item);
        const row = document.createElement('div');
        row.className = 'loose-sensor-item';
        const label = this._hass?.states?.[id]?.attributes?.friendly_name || id;
        const title = document.createElement('div');
        title.className = 'loose-sensor-title';
        title.textContent = label;
        row.appendChild(title);

        // Use one ha-form per selector. Some HA versions emit the whole form
        // with untouched selectors as empty values; merging that payload can
        // erase the previous sensor selection. Isolating each field means an
        // event can only update its own key and preserves all other mappings.
        sensorFields.forEach(({ key, label: fieldLabel }) => {
          const form = document.createElement('ha-form');
          form.hass = this._hass;
          form.computeLabel = () => fieldLabel;
          form.schema = [{ name: key, selector: { entity: { domain: 'sensor' } } }];
          const current = typeof this._loose[i] === 'object' ? this._loose[i][key] || '' : '';
          form.data = { [key]: current };
          form.addEventListener('value-changed', (e) => {
            e.stopPropagation();
            const emitted = e.detail?.value;
            if (!emitted || !Object.prototype.hasOwnProperty.call(emitted, key)) return;
            const old = this._loose[i];
            const next = { ...(typeof old === 'object' ? old : { entity: id }), entity: id };
            const value = emitted[key] || '';
            if (value) next[key] = value;
            else delete next[key];
            this._loose[i] = next;
            this._emit();
          });
          row.appendChild(form);
        });
        list.appendChild(row);
      });
    }

    _drawLooseOrder() {
      const box = this.shadowRoot.querySelector('.xtra');
      if (!box) return;
      if (!this._loose.length) { box.innerHTML = ''; return; }
      box.innerHTML = `<div class="sh">Ordine delle entità senza stanza</div><p class="hint">Usa le frecce per scegliere l'ordine delle Orb. L'ordine viene mantenuto nella visualizzazione.</p><div class="loose-order"></div>`;
      const list = box.querySelector('.loose-order');
      this._loose.forEach((item, i) => {
        const id = idOf(item);
        const label = this._hass?.states?.[id]?.attributes?.friendly_name || id;
        const row = document.createElement('div');
        row.className = 'loose-item';
        row.innerHTML = `<span class="idx">${i + 1}</span><span class="loose-name"></span><button type="button" data-dir="up" title="Sposta su" ${i === 0 ? 'disabled' : ''}><ha-icon icon="mdi:arrow-up"></ha-icon></button><button type="button" data-dir="down" title="Sposta giù" ${i === this._loose.length - 1 ? 'disabled' : ''}><ha-icon icon="mdi:arrow-down"></ha-icon></button>`;
        row.querySelector('.loose-name').textContent = label;
        row.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
          const j = b.dataset.dir === 'up' ? i - 1 : i + 1;
          if (j < 0 || j >= this._loose.length) return;
          [this._loose[i], this._loose[j]] = [this._loose[j], this._loose[i]];
          this._emit();
          this._drawLooseOrder();
          this._drawLooseSensors();
        }));
        list.appendChild(row);
      });
    }

    _drawRooms() {
      const box = this.shadowRoot.querySelector('.rooms');
      box.innerHTML = '';
      const n = this._rooms.length;
      this._rooms.forEach((room, i) => {
        const d = document.createElement('div');
        d.className = 'room';
        d.innerHTML = `<div class="rh"><span class="idx">${i + 1}</span><span class="rn"></span><span class="sp"></span>
          <button type="button" data-a="up" title="Sposta prima" ${i === 0 ? 'disabled' : ''}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
          <button type="button" data-a="down" title="Sposta dopo" ${i === n - 1 ? 'disabled' : ''}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
          <button type="button" data-a="del" title="Elimina stanza"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div><div class="rf"></div>`;
        d.querySelector('.rn').textContent = room.name || `Stanza ${i + 1}`;
        const f = document.createElement('ha-form');
        f.computeLabel = (s) => L[s.name] || s.name;
        f.hass = this._hass;
        f.schema = roomSchema;
        f.data = { ...room, entities: (room.entities || []).map(idOf) };
        f.addEventListener('value-changed', (e) => {
          e.stopPropagation();
          const v = e.detail.value || {};
          const old = new Map((room.entities || []).map((x) => [idOf(x), x]));
          roomKeys.forEach((k) => {
            if (empty(v[k])) delete room[k];
            else room[k] = v[k];
          });
          room.entities = (v.entities || []).map((id) => old.get(id) || id);
          d.querySelector('.rn').textContent = room.name || `Stanza ${i + 1}`;
          this._emit();
        });
        d.querySelector('.rf').appendChild(f);
        d.querySelectorAll('button[data-a]').forEach((b) => b.addEventListener('click', () => this._act(i, b.dataset.a)));
        box.appendChild(d);
      });
    }

    _act(i, a) {
      const rs = this._rooms;
      if (a === 'up' && i > 0) [rs[i - 1], rs[i]] = [rs[i], rs[i - 1]];
      else if (a === 'down' && i < rs.length - 1) [rs[i + 1], rs[i]] = [rs[i], rs[i + 1]];
      else if (a === 'del') {
        if (typeof confirm === 'function' && !confirm(`Eliminare la stanza "${rs[i].name || i + 1}"?`)) return;
        rs.splice(i, 1);
      } else return;
      this._emit();
      this._drawRooms();
    }

    _genChanged(e) {
      e.stopPropagation();
      const v = { ...(e.detail.value || {}) };
      const old = new Map(this._loose.map((x) => [idOf(x), x]));
      this._loose = (v.entities || []).map((id) => old.get(id) || id);
      delete v.entities;
      delete v.rooms;
      Object.keys(v).forEach((k) => {
        if (empty(v[k])) {
          delete v[k];
          delete this._gen[k]; 
        }
      });
      
      const keep = {};
      Object.keys(this._gen).forEach((k) => {
        if (!genSchemaNames.has(k)) keep[k] = this._gen[k];
      });
      this._gen = { ...keep, ...v };
      this._emit();
      this._drawLooseOrder();
      this._drawLooseSensors();
    }

    _emit() {
      const cfg = { ...this._gen };
      Object.keys(cfg).forEach((k) => {
        if (cfg[k] === '' || cfg[k] === null || cfg[k] === undefined) {
          delete cfg[k];
          delete this._gen[k];
        }
      });

      if (this._loose.length) {
        cfg.entities = this._loose.map(idOf);
        cfg.loose_sensors = {};
        this._loose.forEach((item) => {
          if (!item || typeof item !== 'object') return;
          const id = idOf(item);
          const mapping = {};
          if (item.temperature_entity) mapping.temperature_entity = item.temperature_entity;
          if (item.humidity_entity) mapping.humidity_entity = item.humidity_entity;
          if (Object.keys(mapping).length) cfg.loose_sensors[id] = mapping;
        });
        if (!Object.keys(cfg.loose_sensors).length) delete cfg.loose_sensors;
      } else {
        delete cfg.entities;
        delete cfg.loose_sensors;
      }
      if (this._rooms.length) cfg.rooms = this._rooms.map((r) => ({ ...r }));
      else delete cfg.rooms;
      
      this._last = stableStringify(cfg);
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: cfg }, bubbles: true, composed: true }));
    }
  };
}

const HVAC = {
  off: ['Spento', 'mdi:power'], heat: ['Caldo', 'mdi:fire'], cool: ['Freddo', 'mdi:snowflake'], heat_cool: ['Auto', 'mdi:sun-snowflake-variant'],
  auto: ['Auto', 'mdi:thermostat-auto'], dry: ['Deumidifica', 'mdi:water-percent'], fan_only: ['Ventola', 'mdi:fan'],
};
const COL = { heat: [255, 122, 61], cool: [53, 194, 255], dry: [38, 214, 197], humid: [88, 184, 255], auto: [255, 211, 90], fan: [184, 199, 214], off: [91, 107, 125] };
const ACTIONS = { heating: 'Sta scaldando', cooling: 'Sta raffreddando', drying: 'Sta deumidificando', humidifying: 'Sta umidificando', fan: 'Ventola attiva', idle: 'In attesa', defrosting: 'Sbrinamento', preheating: 'Preriscaldamento', off: 'Spento' };
const TH0 = (135 * Math.PI) / 180;
const SWEEP = (270 * Math.PI) / 180;
const ROT = -0.2;
const DEF_ICON = { climate: 'mdi:radiator', fan: 'mdi:fan', humidifier: 'mdi:air-humidifier', sensor: 'mdi:thermometer' };

const DEFAULT_TEMP_THRESHOLDS = [18, 22];
const DEFAULT_HUM_THRESHOLDS = [40, 60];
const DEFAULT_MODE_OPTIONS = [
  { option: 'auto', label: 'Comfort', icon: 'mdi:fire', color: '#7CFC00' },
  { option: 'heat', label: 'Manual', icon: 'mdi:thermometer', color: '#FF3B30' },
  { option: 'off', label: 'Off', icon: 'mdi:power', color: '#9E9E9E' },
];
const isItalian = (h) => String((h && h.locale && h.locale.language) || (typeof navigator !== 'undefined' && navigator.language) || 'en').toLowerCase().startsWith('it');
const tr = (h, it, en) => (isItalian(h) ? it : en);

const numState = (h, id) => {
  if (!id || !h || !h.states || !h.states[id]) return null;
  const v = parseFloat(h.states[id].state);
  return Number.isNaN(v) ? null : v;
};

const usable = (s) => !!s && s.state !== 'unknown' && s.state !== 'unavailable';

const tempColor = (val, thresholds) => {
  if (val === null || val === undefined || Number.isNaN(val)) return 'var(--disabled-text-color)';
  const [lo, hi] = thresholds;
  if (val < lo) return 'orange';
  if (val < hi) return 'orangered';
  return 'red';
};

const humColor = (val, thresholds) => {
  if (val === null || val === undefined || Number.isNaN(val)) return 'var(--disabled-text-color)';
  const [lo, hi] = thresholds;
  if (val < lo) return 'aqua';
  if (val < hi) return 'deepskyblue';
  return 'mediumblue';
};

const fmt = (val, unit) => {
  if (val === null || val === undefined || Number.isNaN(val)) return '--';
  return `${val}${unit || ''}`;
};

const cssColor = (v, def) => {
  const a = parseColor(v, null);
  return a ? `rgb(${a.join(',')})` : typeof v === 'string' && v.trim() ? v.trim() : def;
};
const colorRgb = (v, fallback) => {
  const parsed = parseColor(v, null);
  if (parsed) return parsed;
  if (typeof v === 'string') {
    const m = v.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) return m.slice(1, 4).map((n) => clamp(Number(n), 0, 255));
  }
  return [...fallback];
};
const normOpt = (v) => String(v ?? '').trim().toLowerCase();

const CHIP_KINDS = {
  manual_auto: {
    cap: ['Modo', 'Mode'], optsKey: 'manual_auto_options', onKey: 'manual_auto_on', fallbackOn: 'manual', fallbackIcon: 'mdi:tune-variant',
    hints: [[/auto/i, 'auto'], [/manual/i, 'manual']],
    defaults: [
      { key: 'auto', label: ['Automatico', 'Automatic'], icon: 'mdi:autorenew', color: '#66ff00', aliases: ['auto', 'automatico', 'automatica', 'automatic'] },
      { key: 'manual', label: ['Manuale', 'Manual'], icon: 'mdi:hand-back-right', color: '#ff0066', aliases: ['manual', 'manuale'] },
    ],
  },
  season: {
    cap: ['Stagione', 'Season'], optsKey: 'season_options', onKey: 'season_on', fallbackOn: 'summer', fallbackIcon: 'mdi:sun-snowflake-variant',
    hints: [[/estat|estiv|summer|cool|raffresc|raffredd/i, 'summer'], [/invern|winter|riscald|heat/i, 'winter']],
    defaults: [
      { key: 'summer', label: ['Estate', 'Summer'], icon: 'mdi:white-balance-sunny', color: '#ffe500', aliases: ['estate', 'estivo', 'estiva', 'estivi', 'summer', 'cooling', 'cool', 'raffrescamento', 'raffreddamento'] },
      { key: 'winter', label: ['Inverno', 'Winter'], icon: 'mdi:snowflake', color: '#4FC3F7', aliases: ['inverno', 'invernale', 'invernali', 'winter', 'heating', 'heat', 'riscaldamento'] },
    ],
  },
};
const BOOL_DOMAINS = ['input_boolean', 'switch', 'binary_sensor'];

function resolveChip(kind, cfg, st, h) {
  const K = CHIP_KINDS[kind];
  const domain = st.entity_id.split('.')[0];
  const userOpts = Array.isArray(cfg[K.optsKey]) ? cfg[K.optsKey] : [];
  let key = null;
  if (BOOL_DOMAINS.includes(domain)) {
    const hay = `${st.entity_id} ${st.attributes.friendly_name || ''}`;
    let onKey = cfg[K.onKey];
    if (!onKey) {
      const hit = K.hints.find(([re]) => re.test(hay));
      onKey = hit ? hit[1] : K.fallbackOn;
    }
    const other = K.defaults.find((d) => d.key !== onKey).key;
    key = st.state === 'on' ? onKey : st.state === 'off' ? other : null;
  } else {
    const n = normOpt(st.state);
    const d = K.defaults.find((x) => x.aliases.includes(n));
    key = d ? d.key : null;
  }
  const def = K.defaults.find((d) => d.key === key);
  const uo = userOpts.find((o) => normOpt(o.option) === normOpt(st.state) || (key && normOpt(o.option) === key));
  if (uo) return { key, label: uo.label || uo.option, icon: uo.icon || (def && def.icon) || K.fallbackIcon, color: cssColor(uo.color, (def && def.color) || 'var(--primary-color)') };
  if (def) return { key, label: tr(h, def.label[0], def.label[1]), icon: def.icon, color: def.color };
  return { key: null, label: String(st.state), icon: K.fallbackIcon, color: 'var(--secondary-text-color)' };
}

function thermoGroups(c) {
  const groups = [];
  // Keep room-level sensor associations available for entities also listed as loose.
  const roomSensorByEntity = new Map();
  (c.rooms || []).forEach((r) => {
    const t = r.temperature_entity || '';
    const h = r.humidity_entity || '';
    (r.entities || []).map(normEnt).filter((e) => e && e.entity).forEach((e) => {
      const prior = roomSensorByEntity.get(e.entity) || {};
      roomSensorByEntity.set(e.entity, {
        temperature_entity: e.temperature_entity || prior.temperature_entity || t,
        humidity_entity: e.humidity_entity || prior.humidity_entity || h,
      });
    });
  });
  const looseSensorMap = c.loose_sensors && typeof c.loose_sensors === 'object' ? c.loose_sensors : {};
  const loose = (c.entities || []).map(normEnt).filter((e) => e && e.entity).map((e) => {
    const inherited = roomSensorByEntity.get(e.entity) || {};
    const mapped = looseSensorMap[e.entity] || {};
    return {
      ...e,
      temperature_entity: mapped.temperature_entity || e.temperature_entity || inherited.temperature_entity || '',
      humidity_entity: mapped.humidity_entity || e.humidity_entity || inherited.humidity_entity || '',
    };
  });
  if (loose.length) groups.push({ id: '_', name: null, icon: null, entities: loose, room: null });
  (c.rooms || []).forEach((r, i) => {
    const list = (r.entities || []).map(normEnt).filter((e) => e && e.entity);
    if (r.climate_entity && !list.find((e) => e.entity === r.climate_entity)) list.unshift({ entity: r.climate_entity });
    const sens = { temperature_entity: r.temperature_entity || '', humidity_entity: r.humidity_entity || '' };
    let ents = list.map((e) => ({ ...e, temperature_entity: e.temperature_entity || sens.temperature_entity, humidity_entity: e.humidity_entity || sens.humidity_entity }));
    if (ents.length === 1 && !ents[0].name && r.name) ents[0].name = r.name;
    if (!ents.length && (sens.temperature_entity || sens.humidity_entity)) {
      ents = [{ entity: sens.temperature_entity || sens.humidity_entity, sensorOnly: true, name: r.name, ...sens }];
    }
    if (ents.length) groups.push({ id: `r${i}`, name: r.name || `Stanza ${i + 1}`, icon: r.icon || DEF_ICON[ents[0].entity.split('.')[0]] || null, entities: ents, room: r });
  });
  return groups;
}

const VIEW_HTML = `
  <div class="vbg"></div>
  <div class="vh" data-role="name"></div>
  <div class="room-chips"></div>
  <div class="cv"><canvas></canvas><div class="mid"><div class="lab"></div><div class="val"></div><div class="sub-val"></div></div></div>
  <div class="act"></div>
  <div class="step">
    <button class="st" data-step="-1" aria-label="Diminuisci" type="button"><ha-icon icon="mdi:minus"></ha-icon></button>
    <div class="hint"></div>
    <button class="st" data-step="1" aria-label="Aumenta" type="button"><ha-icon icon="mdi:plus"></ha-icon></button>
  </div>
  <div class="pills"></div>
  <div class="extras"></div>`;

class OrbView {
  constructor(card, it, g) {
    this.card = card;
    this.it = it;
    this.g = g;
    this.entity = it.entity;
    this.compact = false;
    this.shown = false;
    this._pend = {};
    this._tmr = null;
    this._parts = [];
    this._bubbles = Array.from({ length: 9 }, () => ({ x: Math.random() * 1.4 - 0.7, ph: Math.random(), sp: 0.08 + Math.random() * 0.14, s: 1.5 + Math.random() * 3 }));
    this._anim = { level: 0.5, bead: 0.5, act: 0.1, col: [...COL.off], cur: 0.5 };
    this._t = 0;
    this.el = document.createElement('div');
    this.el.className = 'view';
    this.el.innerHTML = VIEW_HTML;
    const q = (s) => this.el.querySelector(s);
    this._nameEl = q('.vh');
    this._roomChipsEl = q('.room-chips');
    this._cvWrap = q('.cv');
    this._cv = q('canvas');
    this._ctx = this._cv.getContext('2d');
    this._mid = q('.mid');
    this._valEl = q('.val');
    this._subValEl = q('.sub-val');
    this._labEl = q('.lab');
    this._actEl = q('.act');
    this._hintEl = q('.hint');
    this._pillsEl = q('.pills');
    this._extrasEl = q('.extras');
    this._stepBtns = [...this.el.querySelectorAll('[data-step]')];
    this._stepBtns.forEach((b) => b.addEventListener('click', () => this._step(Number(b.dataset.step))));
    this._nameEl.addEventListener('click', () => {
      if (this.entity) this.card.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: this.entity }, bubbles: true, composed: true }));
    });
    this._bindDrag();
    this._ro = new ResizeObserver(() => this._size());
    this.observe();
  }

  observe() {
    this._ro.observe(this._cvWrap);
  }
  disconnect() {
    this._ro.disconnect();
  }

  setCompact(b) {
    this.compact = b;
    this.el.classList.toggle('compact', b);
  }

  setSizes(cSize, tSize, rc = 100, stepButtons = 100, selectors = 100) {
    const st = this.el.style;
    const trVal = cSize / 100;
    const crVal = tSize / 100;
    
    st.setProperty('--tr', String(trVal)); // Cifra grande centrale (temperatura attuale)
    st.setProperty('--cr', String(crVal)); // Cifra piccola secondaria (temperatura impostata)
    
    // L'Orb segue la misura più grande tra temperatura attuale e impostata.
    // Il contenitore limita poi la crescita allo spazio realmente disponibile.
    const orbScale = Math.max(0.8, trVal, crVal);
    st.setProperty('--orb-scale', String(orbScale));
    
    st.setProperty('--rc-scale', (rc / 100).toFixed(3));
    st.setProperty('--step-scale', (clamp(stepButtons, 50, 200) / 100).toFixed(3));
    st.setProperty('--selector-scale', (clamp(selectors, 50, 200) / 100).toFixed(3));
  }

  _size() {
    const b = this._cvWrap.getBoundingClientRect();
    this._w = b.width;
    this._h = b.height;
    this._dpr = window.devicePixelRatio || 1;
    this._cv.width = Math.max(1, Math.round(b.width * this._dpr));
    this._cv.height = Math.max(1, Math.round(b.height * this._dpr));
    this._parts = [];
    this.el.style.setProperty('--cw', `${Math.round(b.width)}px`);
    // Dimensione di riferimento non scalata: evita che l'ingrandimento dell'Orb
    // ingrandisca una seconda volta i testi (effetto moltiplicativo).
    const baseWidth = Math.min(b.width, 420);
    this.el.style.setProperty('--text-cw', `${Math.round(baseWidth)}px`);
  }

  get _h_() {
    return this.card._hass;
  }
  _num(n, d = 1) {
    return Number(n).toLocaleString(this._h_?.locale?.language || 'it', { maximumFractionDigits: d });
  }
  _lbl(st, attr, v) {
    try {
      return this._h_.formatEntityAttributeValue ? this._h_.formatEntityAttributeValue(st, attr, v) : v;
    } catch (e) {
      return v;
    }
  }
  displayName() {
    return this.it.name || this._h_?.states[this.entity]?.attributes.friendly_name || this.entity;
  }

  vm() {
    const h = this._h_;
    const st = h.states[this.entity];
    if (!st) return null;
    const a = st.attributes;
    const unitT = h.config?.unit_system?.temperature || '°C';
    const sT = numState(h, this.it.temperature_entity);
    const sH = numState(h, this.it.humidity_entity);
    const pend = this._pend[this.entity];

    if (this.it.sensorOnly) {
      const main = sT ?? sH;
      const isT = sT != null;
      return { kind: 'sensor', st, a, on: true, key: 'auto', temp: sT, hum: sH, cur: main, target: null, min: isT ? 10 : 0, max: isT ? 35 : 100, step: 1,
        unit: isT ? unitT : '%', action: null, levelVal: main, levelMin: isT ? 10 : 0, levelMax: isT ? 35 : 100, main, mainUnit: isT ? unitT : '%', mainDig: 1 };
    }
    const domain = this.entity.split('.')[0];
    if (domain === 'humidifier') {
      const on = st.state === 'on';
      const key = on ? (a.device_class === 'dehumidifier' ? 'dry' : 'humid') : 'off';
      const hum = sH ?? (a.current_humidity != null ? Number(a.current_humidity) : null);
      return { kind: 'humid', st, a, on, key, temp: sT, hum, cur: hum, target: pend ?? a.humidity, min: a.min_humidity ?? 0, max: a.max_humidity ?? 100,
        step: 5, unit: '%', action: a.action, levelVal: hum, levelMin: 0, levelMax: 100, main: hum, mainUnit: '%', mainDig: 0 };
    }
    if (domain === 'fan') {
      const on = st.state === 'on';
      const pct = a.percentage != null ? Number(a.percentage) : null;
      return { kind: 'fan', st, a, on, key: on ? 'fan' : 'off', temp: sT, hum: sH, cur: null, target: pend ?? pct, min: 0, max: 100, step: a.percentage_step || 5, unit: '%',
        action: on ? 'fan' : 'off', levelVal: pct ?? (on ? 50 : 0), levelMin: 0, levelMax: 100, main: pct, mainUnit: '%', mainDig: 0 };
    }
    const mode = st.state;
    const on = mode !== 'off' && mode !== 'unavailable';
    const action = a.hvac_action;
    let key = 'off';
    if (on) {
      if (action === 'heating') key = 'heat';
      else if (action === 'cooling') key = 'cool';
      else if (action === 'drying') key = 'dry';
      else if (action === 'humidifying') key = 'humid';
      else if (action === 'fan') key = 'fan';
      else key = { heat: 'heat', cool: 'cool', dry: 'dry', fan_only: 'fan', heat_cool: 'auto', auto: 'auto' }[mode] || 'heat';
    }
    const min = a.min_temp ?? 7, max = a.max_temp ?? 35;
    // La temperatura centrale della Orb deve provenire dalla termostatica stessa.
    // Il sensore esterno configurato resta separato e viene usato soltanto nella chip.
    const temp = a.current_temperature != null && !Number.isNaN(parseFloat(a.current_temperature)) ? parseFloat(a.current_temperature) : null;
    const hum = sH ?? (a.current_humidity != null ? Number(a.current_humidity) : null);
    return { kind: 'climate', st, a, on, key, mode, range: a.temperature == null && a.target_temp_low != null && a.target_temp_high != null,
      temp, chipTemp: sT, hum, cur: temp, target: pend ?? a.temperature, min, max, step: a.target_temp_step || (unitT === '°C' ? 0.5 : 1), unit: unitT, action,
      levelVal: temp, levelMin: min, levelMax: max, main: temp, mainUnit: unitT, mainDig: 1 };
  }

  _chipsHtml(vm) {
    const c = this.card._config;
    const tu = this._h_.config?.unit_system?.temperature || '°C';
    let s = '';
    const chipTemp = vm.kind === 'climate' ? vm.chipTemp : vm.temp;
    if (this.it.temperature_entity && chipTemp != null) {
      const col = tempColor(chipTemp, c.temp_thresholds);
      s += `<span class="chip" style="color:${col};border-color:${col}">${fmt(chipTemp, tu)}</span>`;
    }
    if (vm.hum != null) {
      const col = humColor(vm.hum, c.humidity_thresholds);
      s += `<span class="chip" style="color:${col};border-color:${col}">${fmt(Math.round(vm.hum), '%')}</span>`;
    }
    return s;
  }

  update() {
    const vm = this.vm();
    this._vmc = vm;
    this._nameEl.textContent = this.displayName();
    if (!vm) {
      this._valEl.textContent = '—';
      this._subValEl.textContent = '';
      this._labEl.textContent = '';
      this._roomChipsEl.innerHTML = '';
      return;
    }
    const un = vm.st.state === 'unavailable';
    const act = vm.kind === 'sensor' ? '' : vm.action && ACTIONS[vm.action] ? ACTIONS[vm.action] : vm.on ? 'Acceso' : un ? 'Non disponibile' : 'Spento';
    const live = vm.on && ['heating', 'cooling', 'drying', 'humidifying', 'fan'].includes(vm.action);
    const actLevel = !vm.on ? 0.08 : live ? 1 : vm.action === 'idle' ? 0.35 : vm.kind === 'sensor' ? 0.3 : 0.6;

    const cfg = this.card._config;
    const stateKey = ({ heat: 'heat', cool: 'cool', dry: 'dry', humid: 'humid', fan: 'fan', auto: 'auto', off: 'off' })[vm.key] || 'off';
    const globalState = cfg.manual_auto_entity && this._h_.states[cfg.manual_auto_entity];
    const globalMode = normOpt(globalState?.state);
    let modeKey = /manual|manuale/.test(globalMode) ? 'manual' : /auto|automatic/.test(globalMode) ? 'auto' : null;
    // Entità on/off (input_boolean, switch, binary_sensor): non indica la modalità del singolo dispositivo,
    // quindi un dispositivo in riscaldamento (heat) è manuale di suo e uno in auto resta auto, a prescindere dal flag globale.
    if (!modeKey && globalState && BOOL_DOMAINS.includes(cfg.manual_auto_entity.split('.')[0])) modeKey = 'manual';
    // Se Home Assistant segnala hvac_action: heating, il riscaldamento
    // ha priorità sui colori Auto/Manuale. Non dipende dal confronto tra
    // setpoint e temperatura, perché hvac_action è già lo stato effettivo.
    const heatDemand = vm.kind === 'climate' && vm.on && vm.action === 'heating';
    const stateColor = heatDemand
      ? (cfg.orb_color_heat_demand ?? cfg.orb_color_heat ?? cfg.orb_color)
      : vm.key === 'heat' && modeKey
        ? (cfg[`orb_color_${modeKey}`] ?? cfg.orb_color_heat)
        : (cfg[`orb_color_${stateKey}`] ?? undefined);
    const chosenColor = stateColor ?? cfg.orb_color;
    const col = colorRgb(chosenColor, COL[vm.key] || COL.off);
    const A = this._anim;
    const fr = (v) => Math.min(1, Math.max(0, (v - vm.min) / (vm.max - vm.min || 1)));
    this._tgt = {
      col, act: actLevel,
      level: vm.levelVal != null ? Math.min(0.96, Math.max(0.07, (vm.levelVal - vm.levelMin) / (vm.levelMax - vm.levelMin || 1))) : 0.5,
      bead: vm.target != null ? fr(vm.target) : 0,
      cur: vm.cur != null ? fr(vm.cur) : null,
    };
    if (!this._init) {
      this._init = true;
      Object.assign(A, { level: this._tgt.level, bead: this._tgt.bead, act: this._tgt.act, col: [...col] });
    }
    this.el.style.setProperty('--c', col.join(','));
    this.el.classList.toggle('live', !!live);
    this._key = vm.key;

    const dig = vm.kind === 'climate' ? 1 : 0;
    this._actEl.textContent = act;

    if (un || !vm.on) {
      this._labEl.textContent = '';
      this._valEl.innerHTML = `<span style="font-size:.55em">${un ? 'Non disp.' : 'Spento'}</span>`;
      this._subValEl.innerHTML = '';
    } else {
      if (vm.temp != null || vm.main != null) {
        const curVal = vm.temp ?? vm.main;
        this._labEl.textContent = vm.kind === 'climate' ? 'Attuale' : 'Valore';
        this._valEl.innerHTML = `${this._num(curVal, vm.mainDig ?? 1)}<small>${vm.unit || vm.mainUnit}</small>`;
      } else {
        this._labEl.textContent = '';
        this._valEl.textContent = '—';
      }

      if (vm.range) {
        this._subValEl.innerHTML = `Impostata: <span style="font-weight:600">${this._num(vm.a.target_temp_low)}–${this._num(vm.a.target_temp_high)}</span>`;
      } else if (vm.target != null) {
        this._subValEl.innerHTML = `Imposta: <span style="font-weight:600">${this._num(vm.target, dig)} ${vm.unit}</span>`;
      } else {
        this._subValEl.innerHTML = '';
      }
    }

    this._roomChipsEl.innerHTML = this._chipsHtml(vm);

    const canStep = vm.on && !un && !vm.range && vm.target != null;
    this._stepBtns.forEach((b) => (b.disabled = !canStep));
    this._hintEl.textContent = canStep ? "Trascina la perla sull'anello" : vm.range ? "Tocca per l'intervallo" : '';

    const sig = JSON.stringify([vm.kind, vm.st.state, vm.a.hvac_modes, vm.a.fan_mode, vm.a.preset_mode, vm.a.mode, vm.on, vm.a.fan_modes, vm.a.preset_modes, vm.a.available_modes]);
    if (sig !== this._csig) {
      this._csig = sig;
      this._controls(vm);
    }
  }

  _controls(vm) {
    const cfg = this.card._config || {};
    const rgb = (k) => {
      const key = ({ heat: 'heat', cool: 'cool', dry: 'dry', humid: 'humid', fan: 'fan', auto: 'auto', off: 'off' })[k] || 'off';
      return colorRgb(cfg[`orb_color_${key}`] ?? cfg.orb_color, COL[k] || [144, 164, 174]).join(',');
    };
    const pills = this._pillsEl;
    if (vm.kind === 'climate') {
      pills.innerHTML = (vm.a.hvac_modes || [])
        .map((m) => {
          const [label, icon] = HVAC[m] || [this._lbl(vm.st, 'hvac_mode', m), 'mdi:thermostat'];
          const k = { fan_only: 'fan', heat_cool: 'auto' }[m] || m;
          return `<button class="pill ${m === vm.mode ? 'on' : ''}" data-mode="${esc(m)}" title="${esc(label)}" style="--pc:${rgb(k)}" type="button"><ha-icon icon="${icon}"></ha-icon><span>${esc(label)}</span></button>`;
        })
        .join('');
    } else if (vm.kind === 'humid' || vm.kind === 'fan') {
      pills.innerHTML = `<button class="pill ${!vm.on ? 'on' : ''}" data-hmode="off" title="Spento" style="--pc:${rgb('off')}" type="button"><ha-icon icon="mdi:power"></ha-icon><span>Spento</span></button>
        <button class="pill ${vm.on ? 'on' : ''}" data-hmode="on" title="Acceso" style="--pc:${rgb(vm.key === 'off' ? (vm.kind === 'fan' ? 'fan' : 'dry') : vm.key)}" type="button"><ha-icon icon="mdi:power-on"></ha-icon><span>Acceso</span></button>`;
    } else {
      pills.innerHTML = '';
    }
    const dom = vm.kind === 'fan' ? 'fan' : 'humidifier';
    pills.querySelectorAll('[data-mode]').forEach((el) => el.addEventListener('click', () => this._svc('climate', 'set_hvac_mode', { hvac_mode: el.dataset.mode })));
    pills.querySelectorAll('[data-hmode]').forEach((el) => el.addEventListener('click', () => this._svc(dom, el.dataset.hmode === 'on' ? 'turn_on' : 'turn_off')));

    const sel = (key, label, icon, list, cur, attr) =>
      list && list.length
        ? `<label class="sel" style="--pc:${rgb(vm.key)}"><ha-icon icon="${icon}"></ha-icon><span>${label}</span><select data-sel="${key}">${list.map((v) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(this._lbl(vm.st, attr, v))}</option>`).join('')}</select></label>`
        : '';
    const ex = this._extrasEl;
    ex.innerHTML = !vm.on || vm.st.state === 'unavailable' || vm.kind === 'sensor' ? ''
      : vm.kind === 'climate'
        ? sel('fan', 'Ventola', 'mdi:fan', vm.a.fan_modes, vm.a.fan_mode, 'fan_mode') + sel('preset', 'Programma', 'mdi:tune-variant', vm.a.preset_modes, vm.a.preset_mode, 'preset_mode')
        : vm.kind === 'fan'
          ? sel('fanp', 'Preset', 'mdi:tune-variant', vm.a.preset_modes, vm.a.preset_mode, 'preset_mode')
          : sel('hum', 'Modalità', 'mdi:tune-variant', vm.a.available_modes, vm.a.mode, 'mode');
    ex.querySelectorAll('[data-sel]').forEach((el) =>
      el.addEventListener('change', () => {
        const k = el.dataset.sel;
        if (k === 'fan') this._svc('climate', 'set_fan_mode', { fan_mode: el.value });
        if (k === 'preset') this._svc('climate', 'set_preset_mode', { preset_mode: el.value });
        if (k === 'fanp') this._svc('fan', 'set_preset_mode', { preset_mode: el.value });
        if (k === 'hum') this._svc('humidifier', 'set_mode', { mode: el.value });
      })
    );
  }

  _svc(domain, svc, data = {}) {
    this._h_.callService(domain, svc, { entity_id: this.entity, ...data });
  }

  _setTarget(v) {
    const vm = this._vmc;
    const id = this.entity;
    v = Math.min(vm.max, Math.max(vm.min, Math.round(v / vm.step) * vm.step));
    v = parseFloat(v.toFixed(2));
    if (v === this._pend[id]) return;
    this._pend[id] = v;
    this.update();
    clearTimeout(this._tmr);
    this._tmr = setTimeout(async () => {
      try {
        const h = this._h_;
        if (vm.kind === 'humid') await h.callService('humidifier', 'set_humidity', { entity_id: id, humidity: v });
        else if (vm.kind === 'fan') await h.callService('fan', 'set_percentage', { entity_id: id, percentage: Math.round(v) });
        else await h.callService('climate', 'set_temperature', { entity_id: id, temperature: v });
      } finally {
        setTimeout(() => {
          delete this._pend[id];
          if (this._h_) this.update();
        }, 1500);
      }
    }, 600);
  }

  _step(dir) {
    const vm = this._vmc;
    if (!vm || vm.target == null) return;
    this._setTarget((this._pend[this.entity] ?? vm.target) + dir * vm.step);
  }

  _geom() {
    const w = this._w, h = this._h;
    const R = Math.min(w, h) * 0.29;
    return { w, h, cx: w / 2, cy: h / 2, R, rx: R * 1.62, ry: R * 0.54 };
  }
  _ringPt(g, th) {
    const ex = g.rx * Math.cos(th), ey = g.ry * Math.sin(th);
    return { x: g.cx + ex * Math.cos(ROT) - ey * Math.sin(ROT), y: g.cy + ex * Math.sin(ROT) + ey * Math.cos(ROT), d: Math.sin(th) };
  }

  _bindDrag() {
    const cv = this._cv;
    const toPos = (e) => {
      const b = cv.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const local = (p) => {
      const g = this._geom();
      const dx = p.x - g.cx, dy = p.y - g.cy;
      const ux = dx * Math.cos(ROT) + dy * Math.sin(ROT);
      const uy = -dx * Math.sin(ROT) + dy * Math.cos(ROT);
      return { nx: ux / g.rx, ny: uy / g.ry };
    };
    const canDrag = () => this._vmc && this._vmc.on && !this._vmc.range && this._vmc.target != null;
    const inBand = (p) => {
      const { nx, ny } = local(p);
      const n = Math.hypot(nx, ny);
      return n > 0.72 && n < 1.32;
    };
    const apply = (p) => {
      const { nx, ny } = local(p);
      let s = (((Math.atan2(ny, nx) - TH0) % TAU) + TAU) % TAU;
      if (s > SWEEP) s = s < SWEEP + (TAU - SWEEP) / 2 ? SWEEP : 0;
      const vm = this._vmc;
      this._setTarget(vm.min + (s / SWEEP) * (vm.max - vm.min));
      this._anim.bead = s / SWEEP;
    };
    cv.addEventListener('touchstart', (e) => {
      if (canDrag() && inBand(toPos(e.touches[0]))) e.preventDefault();
    }, { passive: false });
    cv.addEventListener('pointerdown', (e) => {
      const p = toPos(e);
      if (this._vmc?.range) {
        this.card.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: this.entity }, bubbles: true, composed: true }));
        return;
      }
      if (!canDrag() || !inBand(p)) return;
      this._drag = true;
      cv.setPointerCapture(e.pointerId);
      apply(p);
    });
    cv.addEventListener('pointermove', (e) => {
      if (this._drag) apply(toPos(e));
    });
    const end = () => (this._drag = false);
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }

  _spawn(p, key, first) {
    const g = this._geom();
    const { w, h } = g;
    p.seed = Math.random();
    p.size = 1.1 + Math.random() * 2.6;
    p.t = first ? Math.random() : 0;
    p.dur = 2.2 + Math.random() * 3;
    switch (key) {
      case 'heat': p.x = w * (0.18 + 0.64 * Math.random()); p.y = h * (0.78 + 0.22 * Math.random()); p.vx = 0; p.vy = -(35 + Math.random() * 70); break;
      case 'cool': p.x = Math.random() * w; p.y = -4 + Math.random() * h * 0.2; p.vx = 0; p.vy = 22 + Math.random() * 48; break;
      case 'dry': { const a = Math.random() * TAU; p.x = g.cx + Math.cos(a) * w * 0.49; p.y = g.cy + Math.sin(a) * h * 0.49; p.vx = 0; p.vy = 0; break; }
      case 'humid': { const a = Math.random() * TAU; p.x = g.cx + Math.cos(a) * g.R * 0.9; p.y = g.cy + Math.sin(a) * g.R * 0.9; p.vx = Math.cos(a) * (25 + Math.random() * 45); p.vy = Math.sin(a) * (25 + Math.random() * 45) - 10; break; }
      case 'fan': p.x = -10; p.y = h * (0.12 + 0.76 * Math.random()); p.vx = 140 + Math.random() * 160; p.vy = (Math.random() - 0.5) * 12; p.dur = 2.4; break;
      case 'auto': p.x = Math.random() * w; p.y = Math.random() * h; p.vx = (Math.random() - 0.5) * 16; p.vy = (Math.random() - 0.5) * 16; break;
      default: p.x = Math.random() * w; p.y = h * (0.5 + Math.random() * 0.5); p.vx = 0; p.vy = -(6 + Math.random() * 8); p.dur = 5;
    }
    if (first && key === 'dry') {
      const k = Math.random();
      p.x = lerp(p.x, g.cx, k * 0.8);
      p.y = lerp(p.y, g.cy, k * 0.8);
    }
  }

  frame(dt) {
    this._t += dt;
    if (!this._w || !this._tgt) {
      if (!this._w) this._size();
      return;
    }
    const ctx = this._ctx;
    const A = this._anim, T = this._tgt;
    const slow = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;
    const k = Math.min(1, dt * 3.2);
    A.level = lerp(A.level, T.level, k * 0.6);
    if (!this._drag) A.bead = lerp(A.bead, T.bead, k * 1.4);
    A.act = lerp(A.act, T.act, k);
    A.cur = T.cur == null ? null : A.cur == null ? T.cur : lerp(A.cur, T.cur, k);
    for (let i = 0; i < 3; i++) A.col[i] = lerp(A.col[i], T.col[i], k);
    const [cr, cg, cb] = A.col.map((v) => v | 0);
    const col = (a) => `rgba(${cr},${cg},${cb},${a})`;
    const g = this._geom();
    const { w, h, cx, cy, R } = g;
    const t = this._t * slow;
    const key = this._key || 'off';

    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const halo = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 2.1);
    halo.addColorStop(0, col(0.28 * (0.3 + A.act * 0.7)));
    halo.addColorStop(1, col(0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    const N = 90;
    if (this._parts.length !== N) this._parts = Array.from({ length: N }, () => ({}));
    const active = Math.min(N, Math.max(0, Math.floor(N * (0.12 + 0.88 * A.act))));
    if (this._pk !== key) {
      this._pk = key;
      this._parts.forEach((p) => this._spawn(p, key, true));
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < active; i++) {
      const p = this._parts[i];
      p.t += dt / p.dur;
      if (p.t >= 1) this._spawn(p, key, false);
      const alpha = Math.sin(Math.PI * Math.min(1, p.t));
      if (key === 'heat') { p.x += Math.sin(p.t * 7 + p.seed * 10) * 18 * dt; p.y += p.vy * dt * slow; }
      else if (key === 'cool') { p.x += Math.sin(p.t * 4 + p.seed * 9) * 16 * dt; p.y += p.vy * dt * slow; }
      else if (key === 'dry') {
        const dx = g.cx - p.x, dy = g.cy - p.y, d = Math.hypot(dx, dy) || 1;
        const sp = (50 + d * 0.7) * slow;
        p.x += (dx / d) * sp * dt; p.y += (dy / d) * sp * dt;
        if (d < R * 1.02) p.t = 1;
      } else if (key === 'fan') { p.x += p.vx * dt * slow; p.y += p.vy * dt; }
      else { p.x += p.vx * dt * slow; p.y += p.vy * dt * slow; }
      let c = `rgba(${cr},${cg},${cb},${0.75 * alpha * (0.3 + A.act * 0.7)})`;
      if (key === 'heat') c = `rgba(255,${(140 + p.seed * 90) | 0},60,${0.85 * alpha})`;
      if (key === 'cool') c = `rgba(215,244,255,${0.85 * alpha})`;
      if (key === 'auto') c = `rgba(255,${(200 + p.seed * 50) | 0},${(90 + p.seed * 150) | 0},${alpha * (0.5 + 0.5 * Math.sin(t * 5 + p.seed * 20))})`;
      if (key === 'fan') {
        ctx.strokeStyle = `rgba(210,225,240,${0.5 * alpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 22, p.y - p.vy * 0.15);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
      ctx.fillStyle = c.replace(/[\d.]+\)$/, '0.12)');
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 3.2, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    this._ring(ctx, g, A, col, false);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();
    const glass = ctx.createRadialGradient(cx, cy - R * 0.2, R * 0.1, cx, cy, R);
    glass.addColorStop(0, 'rgba(34,44,66,.65)');
    glass.addColorStop(1, 'rgba(8,12,24,.9)');
    ctx.fillStyle = glass;
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    const top = cy + R - A.level * 2 * R;
    const amp = 2.5 + A.act * 5;
    const wave = (off, ph, alpha, spd) => {
      ctx.beginPath();
      ctx.moveTo(cx - R, cy + R);
      for (let x = cx - R; x <= cx + R; x += 4) {
        ctx.lineTo(x, top + off + Math.sin(x * 0.05 + t * spd + ph) * amp + Math.sin(x * 0.09 - t * spd * 0.7) * amp * 0.5);
      }
      ctx.lineTo(cx + R, cy + R);
      ctx.closePath();
      const lg = ctx.createLinearGradient(0, top, 0, cy + R);
      lg.addColorStop(0, `rgba(${Math.min(255, cr + 60)},${Math.min(255, cg + 60)},${Math.min(255, cb + 60)},${alpha})`);
      lg.addColorStop(1, `rgba(${(cr * 0.45) | 0},${(cg * 0.45) | 0},${(cb * 0.45) | 0},${alpha})`);
      ctx.fillStyle = lg;
      ctx.fill();
    };
    wave(3, 1.7, 0.55, 1.1);
    wave(0, 0, 0.9, 1.6);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (const b of this._bubbles) {
      const prog = (b.ph + t * b.sp * (0.4 + A.act)) % 1;
      const by = cy + R - prog * (A.level * 2 * R);
      if (by < top + 4) continue;
      ctx.beginPath();
      ctx.arc(cx + b.x * R * 0.7 + Math.sin(t * 2 + b.ph * 9) * 4, by, b.s, 0, TAU);
      ctx.fill();
    }
    const sh = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = sh;
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    const hl = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.46, R * 0.02, cx - R * 0.38, cy - R * 0.46, R * 0.62);
    hl.addColorStop(0, 'rgba(255,255,255,.6)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = col(0.55);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();

    this._ring(ctx, g, A, col, true);
  }

  _ring(ctx, g, A, col, front) {
    const NT = 60;
    for (let i = 0; i <= NT; i++) {
      const f = i / NT;
      const p = this._ringPt(g, TH0 + SWEEP * f);
      if (p.d >= 0 !== front) continue;
      const s = 1 + 0.4 * p.d;
      const dx = p.x - g.cx, dy = p.y - g.cy, dl = Math.hypot(dx, dy) || 1;
      const len = 7 * s;
      const lit = f <= A.bead + 0.0001;
      ctx.lineWidth = 2.4 * s;
      ctx.lineCap = 'round';
      ctx.strokeStyle = lit ? col(0.4 + 0.6 * ((p.d + 1) / 2)) : `rgba(255,255,255,${0.1 + 0.12 * ((p.d + 1) / 2)})`;
      ctx.beginPath();
      ctx.moveTo(p.x - (dx / dl) * len * 0.5, p.y - (dy / dl) * len * 0.5);
      ctx.lineTo(p.x + (dx / dl) * len * 0.5, p.y + (dy / dl) * len * 0.5);
      ctx.stroke();
    }
    if (A.cur != null && this._vmc?.on) {
      const p = this._ringPt(g, TH0 + SWEEP * A.cur);
      if (p.d >= 0 === front) {
        ctx.strokeStyle = 'rgba(255,255,255,.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5 * (1 + 0.3 * p.d), 0, TAU);
        ctx.stroke();
      }
    }
    if (this._vmc?.on && this._vmc.target != null && !this._vmc.range) {
      const p = this._ringPt(g, TH0 + SWEEP * A.bead);
      if (p.d >= 0 === front) {
        const r = 10 * (1 + 0.28 * p.d);
        const gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
        gl.addColorStop(0, col(0.8));
        gl.addColorStop(1, col(0));
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 3, 0, TAU);
        ctx.fill();
        const pg = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
        pg.addColorStop(0, '#fff');
        pg.addColorStop(1, col(1));
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fill();
      }
    }
  }
}

class ThermoOrbCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._views = [];
    this._loop = this._loop.bind(this);
  }

  static getConfigElement() {
    return document.createElement('thermo-orb-card-editor');
  }
  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states || {}).filter((e) => /^(climate|humidifier|fan)\./.test(e)).slice(0, 4);
    return { title: 'Clima', layout: 'select', rooms: ids.length ? [{ name: 'Stanza 1', entities: ids }] : [] };
  }

    setConfig(config) {
      if (!config) throw new Error('Configurazione mancante');
      const groups = thermoGroups(config);
      const hasGlobal = !!(config.mode_entity || config.central_heating_entity || config.manual_auto_entity || config.season_entity || ['temperature', 'humidity'].some((k) => ['max', 'avg', 'min'].some((t) => config[`${k}_${t}_entity`])) || config.avg_temperature_entity || config.avg_humidity_entity);
      if (!groups.length && !hasGlobal) throw new Error('Aggiungi almeno una stanza oppure un elemento globale');
      
      const cfg = { ...config };
      
      // Se i campi di temperatura/umidità media sono vuoti o non definiti, eliminiamo le chiavi dal cfg
      ['temperature_avg_entity', 'avg_temperature_entity', 'humidity_avg_entity', 'avg_humidity_entity'].forEach((k) => {
        if (!cfg[k]) {
          delete cfg[k];
        }
      });

      const looksOverview = (cfg.rooms || []).some((r) => r.climate_entity) || !!cfg.columns;
      cfg.layout = cfg.layout || (looksOverview ? 'grid' : 'select');
      cfg.room_columns = cfg.room_columns ?? (cfg.columns || undefined);
      if (cfg.room_columns !== undefined && cfg.room_columns !== null && cfg.room_columns !== '') cfg.room_columns = Math.max(1, Math.floor(Number(cfg.room_columns) || 1));
      cfg.entity_columns = Math.max(1, Math.floor(Number(cfg.entity_columns) || 1));
      cfg.temp_thresholds = cfg.temp_thresholds || DEFAULT_TEMP_THRESHOLDS;
      cfg.humidity_thresholds = cfg.humidity_thresholds || DEFAULT_HUM_THRESHOLDS;
      cfg.mode_options = cfg.mode_options && cfg.mode_options.length ? cfg.mode_options : DEFAULT_MODE_OPTIONS;
      
      cfg.target_size = clamp(Number(cfg.target_size) || 100, 50, 200);
      cfg.current_size = clamp(Number(cfg.current_size) || 100, 50, 200);
      cfg.room_chips_size = clamp(Number(cfg.room_chips_size) || 100, 50, 200);
      cfg.step_buttons_size = clamp(Number(cfg.step_buttons_size) || 100, 50, 200);
      cfg.selectors_size = clamp(Number(cfg.selectors_size) || 100, 50, 200);
      
      this._config = cfg;
      this._groups = groups;
      this._sel = null;
      this._dev = {};
      this._csig = null;
      this._gsig = null;
      this._build();
      if (this._hass) this.hass = this._hass;
    }

  connectedCallback() {
    this._on = true;
    if (this._built) {
      this._io.observe(this._card);
      this._views.forEach((v) => v.observe());
    }
    this._start();
  }
  disconnectedCallback() {
    this._on = false;
    this._io?.disconnect();
    this._views.forEach((v) => v.disconnect());
  }

  getCardSize() {
    return 7;
  }
  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: 'auto' };
  }

  _build() {
    this._views.forEach((v) => v.disconnect());
    this._views = [];
    const gs = this._groups;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        [hidden] { display: none !important; }
        ha-card { position: relative; overflow: hidden; border-radius: var(--ha-card-border-radius, 26px); --acc: #35c2ff; }
        .in { position: relative; box-sizing: border-box; min-width: 0; padding: 16px 16px 18px; color: var(--primary-text-color); }
        .title { font-size: 1.15rem; font-weight: 600; letter-spacing: -0.01em; padding-bottom: 10px; }
        .rooms { display: grid; gap: 12px; align-items: start; min-width: 0; }
        .views { display: grid; grid-template-columns: repeat(var(--orb-columns, 1), minmax(0, 1fr)); align-items: start; gap: 12px; min-width: 0; width: 100%; box-sizing: border-box; }
        .views > .view { min-width: 0; width: 100%; }
        @media (max-width: 560px) { .in { padding: 8px 8px 10px; } .rooms { grid-template-columns: minmax(0, 1fr) !important; gap: 8px; } .views { --orb-columns: 1 !important; gap: 6px; } .room { min-width: 0; } }
        ${CHIP_CSS}

        .gtop { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
        .gtop:empty { display: none; }
        .top-row { display: flex; gap: 10px; }
        .mode-btn { flex: 1 1 0; display: flex; align-items: center; justify-content: center; gap: calc(6px * var(--selector-scale, 1)); padding: calc(10px * var(--selector-scale, 1)) calc(6px * var(--selector-scale, 1)); border-radius: 14px; cursor: pointer; font-weight: 700; font-size: calc(.82rem * var(--selector-scale, 1));
          background: color-mix(in srgb, var(--primary-text-color) 8%, transparent); user-select: none; box-sizing: border-box; transition: box-shadow .3s, color .3s; --mdc-icon-size: calc(20px * var(--selector-scale, 1)); }
        
        .central-row { display: flex; gap: 8px; align-items: stretch; flex-wrap: wrap; }
        .central-status { flex: 1 1 0; min-width: 140px; display: flex; align-items: center; justify-content: center; text-align: center; font-weight: 700; font-size: .95rem; padding: 9px; border-radius: 12px; cursor: pointer; box-sizing: border-box; background: color-mix(in srgb, var(--primary-text-color) 5%, transparent); }
        .mchip { flex: 1 1 0; min-width: 120px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 6px 10px; border-radius: 12px; cursor: pointer; border: 2px solid; box-sizing: border-box; user-select: none; -webkit-tap-highlight-color: transparent;
          background: color-mix(in srgb, var(--primary-text-color) 5%, transparent); font-weight: 700; font-size: .85rem; --mdc-icon-size: 22px; transition: box-shadow .3s, transform .12s; }
        .mchip:active { transform: scale(.96); }
        .mchip .mc-t { display: flex; flex-direction: column; line-height: 1.15; }
        .mchip .mc-cap { font-size: .62rem; font-weight: 600; color: var(--secondary-text-color); letter-spacing: .02em; }
        
        .blink { animation: blink 1.4s infinite; }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        .stats-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .stat-chip { display: flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 20px; border: 2px solid; font-size: .75rem; font-weight: 600; }

        .view { --c: 91,107,125; --tr: 1; --cr: 1; --orb-scale: 1; --rc-scale: 1; position: relative; display: flex; flex-direction: column; gap: 8px; border-radius: 18px; transition: box-shadow .4s; }
        .vbg { position: absolute; inset: -6px; pointer-events: none; background: radial-gradient(70% 50% at 50% 40%, rgba(var(--c), .35), transparent 72%); transition: background .8s; }
        .view > * { position: relative; }
        .view > .vbg { position: absolute; }
        .vh { display: none; text-align: center; font-weight: 700; font-size: .95rem; cursor: pointer; }
        .room-chips { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; min-height: 1px; }
        .room-chips:empty { display: none; }
        .chip { display: inline-flex; align-items: center; justify-content: center; flex: 0 1 auto; min-width: max-content; box-sizing: border-box; font-size: clamp(.65rem, calc(0.75rem * var(--rc-scale, 1)), 1.5rem); font-weight: 700; line-height: 1.15; padding: calc(5px * var(--rc-scale, 1)) calc(10px * var(--rc-scale, 1)); border-radius: 12px; border: 1.5px solid; background: color-mix(in srgb, var(--primary-text-color) 10%, transparent); text-align: center; }
        /* When both readings are present, keep the temperature and humidity chips equal in width. */
        .room-chips:has(.chip:nth-child(2)) .chip { flex: 1 1 0; min-width: 0; }
        
        .cv { position: relative; box-sizing: border-box; width: min(100%, calc(320px * var(--orb-scale, 1))); max-width: 100%; min-width: 0; margin: 0 auto; aspect-ratio: 1 / 1; transition: width .3s ease, max-width .3s ease, aspect-ratio .3s ease; }
        @media (max-width: 560px) {
          .cv { max-width: 100%; aspect-ratio: 1 / 1; }
          .view { min-width: 0; }
          .step { gap: 14px; }
          .st { width: 40px; height: 40px; --mdc-icon-size: 22px; }
          .pills { gap: 6px; }
          .pill { max-width: 100%; box-sizing: border-box; padding: 7px 10px; font-size: .78rem; }
          .extras { gap: 6px; }
          .sel { min-width: 0; flex: 1 1 120px; }
          /* On phones, compact/grid mode must not hide the mode controls or sensor readings. */
          .view.compact .hint { display: block; }
          .view.compact .extras { display: flex; }
          .view.compact .pill span { display: inline; }
          .gtop { display: flex; min-width: 0; width: 100%; }
          .top-row, .central-row, .stats-row { min-width: 0; width: 100%; box-sizing: border-box; }
          .top-row, .central-row, .stats-row { flex-wrap: wrap; }
          .mode-btn, .central-status, .mchip, .stat-chip { min-width: 0; max-width: 100%; }
          .stat-chip { white-space: normal; overflow-wrap: anywhere; }
        }
        canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: pan-y; }
        .mid { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center; pointer-events: none; display: flex; flex-direction: column; align-items: center; gap: 2px; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,.55); width: 70%; }
        .lab { font-size: calc(var(--text-cw, 360px) * .022 * var(--tr, 1)); opacity: .8; }
        .val { font-size: calc(var(--text-cw, 360px) * .118 * var(--tr, 1)); font-weight: 700; letter-spacing: -0.03em; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .val small { font-size: .45em; font-weight: 600; margin-left: 2px; opacity: .8; letter-spacing: 0; }
        .sub-val { font-size: calc(var(--text-cw, 360px) * .035 * var(--cr, 1)); opacity: .9; margin-top: 2px; }
        .act { text-align: center; font-weight: 600; font-size: .95rem; color: rgb(var(--c)); filter: brightness(1.25); min-height: 1.3em; }
        .act:empty { display: none; }
        .step { display: flex; align-items: center; justify-content: center; gap: calc(26px * var(--step-scale, 1)); }
        .st { border: 1px solid rgba(var(--c), .55); width: calc(46px * var(--step-scale, 1)); height: calc(46px * var(--step-scale, 1)); border-radius: 50%; cursor: pointer; display: grid; place-items: center; --mdc-icon-size: calc(26px * var(--step-scale, 1)); color: rgb(var(--c)); background: color-mix(in srgb, var(--primary-text-color) 10%, transparent); transition: background .2s, transform .12s; }
        .st:hover { background: rgba(var(--c), .35); } .st:active { transform: scale(.92); } .st[disabled] { opacity: .25; pointer-events: none; }
        .hint { font-size: .78rem; color: var(--secondary-text-color); min-width: 100px; text-align: center; }
        .pills { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
        .pills:empty, .extras:empty { display: none; }
        .pill { display: inline-flex; align-items: center; gap: calc(6px * var(--selector-scale, 1)); border: 0; font: inherit; font-size: calc(.85rem * var(--selector-scale, 1)); font-weight: 600; cursor: pointer; --mdc-icon-size: calc(19px * var(--selector-scale, 1)); padding: calc(9px * var(--selector-scale, 1)) calc(14px * var(--selector-scale, 1)); border-radius: 999px;
          color: var(--primary-text-color); background: color-mix(in srgb, var(--primary-text-color) 8%, transparent); transition: background .25s, box-shadow .25s; }
        .pill.on { background: rgb(var(--pc)); color: #0b0b0b; box-shadow: 0 0 18px rgba(var(--pc), .55); }
        .extras { display: flex; flex-wrap: wrap; gap: 8px; }
        .sel { flex: 1 1 140px; display: flex; align-items: center; gap: calc(8px * var(--selector-scale, 1)); padding: calc(6px * var(--selector-scale, 1)) calc(12px * var(--selector-scale, 1)); border-radius: 14px; border: 1px solid rgba(var(--pc), .45); font-size: calc(.8rem * var(--selector-scale, 1)); color: rgb(var(--pc)); --mdc-icon-size: calc(19px * var(--selector-scale, 1)); background: color-mix(in srgb, rgb(var(--pc)) 9%, transparent); }
        .sel select { flex: 1; min-width: 0; font: inherit; font-size: calc(.9rem * var(--selector-scale, 1)); border: 0; background: transparent; color: var(--primary-text-color); padding: 6px 0; cursor: pointer; text-align: right; }
        .sel select option { color: #000; }
        .st:focus-visible, .pill:focus-visible, select:focus-visible { outline: 2px solid rgb(var(--c)); outline-offset: 2px; }

        .view.compact { border: 2px solid rgba(var(--c), .5); padding: 8px 8px 10px; }
        .view.compact.live { box-shadow: 0 0 14px 3px rgba(var(--c), .5); }
        .view.compact .vh { display: block; }
        .view.compact .hint, .view.compact .extras { display: none; }
        .view.compact .pill { padding: calc(8px * var(--selector-scale, 1)); } .view.compact .pill span { display: none; }
        .view.compact .st { width: calc(38px * var(--step-scale, 1)); height: calc(38px * var(--step-scale, 1)); --mdc-icon-size: calc(22px * var(--step-scale, 1)); }
        .view.compact .step { gap: 14px; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      </style>
      <ha-card>
        <div class="in">
          <div class="title"></div>
          <div class="gtop"></div>
          <div class="rchips"></div>
          <div class="rooms">${gs
            .map(
              (g) => `<section class="room" data-g="${esc(g.id)}"><div class="rhd">${g.icon ? `<ha-icon icon="${esc(g.icon)}"></ha-icon>` : ''}<span class="rn">${esc(g.name || '')}</span></div><div class="rdev"></div><div class="views"></div></section>`
            )
            .join('')}</div>
        </div>
      </ha-card>`;
    const r = this.shadowRoot;
    const c = this._config;
    this._card = r.querySelector('ha-card');
    this._titleEl = r.querySelector('.title');
    this._gtop = r.querySelector('.gtop');
    this._chips = r.querySelector('.rchips');
    this._roomsEl = r.querySelector('.rooms');
    this._gtop.addEventListener('click', (ev) => this._onGlobalClick(ev));
    let holdTimer = null;
    const roleOf = (ev) => (ev.composedPath ? ev.composedPath() : [ev.target]).find((n) => n && n.dataset && n.dataset.role === 'chip');
    this._gtop.addEventListener('pointerdown', (ev) => {
      const t = roleOf(ev);
      if (!t) return;
      this._held = false;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        this._held = true;
        this._moreInfo(t.dataset.entity);
      }, 500);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => this._gtop.addEventListener(e, () => clearTimeout(holdTimer)));
    this._rooms = [...r.querySelectorAll('.room')].map((el, i) => ({ el, g: gs[i], hd: el.querySelector('.rhd'), dev: el.querySelector('.rdev'), box: el.querySelector('.views') }));
    this._rooms.forEach((rm) => {
      const isLooseGroup = rm.g.id === '_';
      const orbCols = isLooseGroup ? (Number(c.entity_columns) || 1) : (Number(rm.g.room?.orb_columns) || 1);
      // The requested column count is not capped; keep it a positive integer.
      rm.box.style.setProperty('--orb-columns', String(Math.max(1, Math.floor(orbCols))));
      rm.views = rm.g.entities.map((it) => {
        const v = new OrbView(this, it, rm.g);
        v.setSizes(c.current_size || 100, c.target_size || 100, c.room_chips_size, c.step_buttons_size, c.selectors_size);
        rm.box.appendChild(v.el);
        this._views.push(v);
        return v;
      });
    });
    this._io = new IntersectionObserver((e) => {
      this._vis = e[0].isIntersecting;
      if (this._vis) this._start();
    });
    this._io.observe(this._card);
    this._built = true;
    this._applyLayout();
  }

  _applyLayout() {
    const c = this._config;
    const gs = this._groups;
    const grid = c.layout === 'grid';
    const total = this._views.length;
    if (!gs.length) {
      this._chips.hidden = true;
      return;
    }
    if (!grid && (!this._sel || !gs.find((g) => g.id === this._sel))) this._sel = gs[0].id;
    this._rooms.forEach((rm) => {
      const showRoom = grid || rm.g.id === this._sel;
      const multi = rm.g.entities.length > 1;
      rm.el.hidden = !showRoom;
      rm.hd.hidden = !(grid && rm.g.name && multi);
      rm.el.classList.toggle('panel', grid && multi);
      if (!this._dev[rm.g.id]) this._dev[rm.g.id] = rm.g.entities[0].entity;
      rm.views.forEach((v) => {
        v.setCompact(grid && total > 1);
        v.shown = showRoom && (grid || !multi || v.entity === this._dev[rm.g.id]);
        v.el.hidden = !v.shown;
      });
    });
    this._roomsEl.style.gridTemplateColumns = grid && gs.length > 1 ? roomGridCols(c) : '1fr';
    this._chips.hidden = grid;
  }

  _modeLabel(mode, h) {
    const option = normOpt(mode.option);
    const label = normOpt(mode.label);
    if (option === 'auto' && label === 'comfort') return 'Comfort';
    if (option === 'heat' && (label === 'manual' || label === 'manuale')) return tr(h, 'Manuale', 'Manual');
    if (option === 'off' && (label === 'off' || label === 'spento')) return tr(h, 'Spento', 'Off');
    return mode.label || mode.option;
  }

  _renderGlobal() {
    const c = this._config;
    const h = this._hass;
    let html = '';

    if (c.mode_entity && usable(h.states[c.mode_entity])) {
      const helper = h.states[c.mode_entity];
      const helperOptions = Array.isArray(helper.attributes && helper.attributes.options) ? helper.attributes.options : null;
      const btns = [];
      for (const m of c.mode_options) {
        const ho = helperOptions ? helperOptions.find((o) => normOpt(o) === normOpt(m.option)) : m.option;
        if (ho === undefined) continue;
        const active = normOpt(helper.state) === normOpt(ho);
        const optNorm = normOpt(m.option);
        const labelNorm = normOpt(m.label);
        const combined = `${optNorm} ${labelNorm}`;
        let stateKey = /cool|raffresc|fredd/.test(combined) ? 'cool'
          : /dry|deumid/.test(combined) ? 'dry'
          : /humid|umidific/.test(combined) ? 'humid'
          : /fan|ventol/.test(combined) ? 'fan'
          : /off|spento/.test(combined) ? 'off'
          : /auto|automatic|comfort/.test(combined) ? 'auto'
          : /manual/.test(combined) ? 'manual'
          : /heat|riscald|caldo|inverno/.test(combined) ? 'heat' : null;
        const stateConfigKey = stateKey === 'manual' ? 'orb_color_manual' : stateKey ? `orb_color_${stateKey}` : null;
        const configured = stateConfigKey && c[stateConfigKey] != null ? c[stateConfigKey] : c.orb_color;
        const fallback = cssColor(m.color, 'var(--primary-color)');
        const color = configured != null ? `rgb(${colorRgb(configured, COL[stateKey] || COL.off).join(',')})` : fallback;
        btns.push(`<div class="mode-btn" data-role="mode-btn" data-option="${esc(ho)}" style="--mode-color:${color};color:${active ? color : 'var(--secondary-text-color)'};box-shadow:${active ? `0 0 10px 2px ${color}` : 'none'};">
          <ha-icon icon="${esc(m.icon || 'mdi:circle')}"></ha-icon>${esc(this._modeLabel(m, h))}</div>`);
      }
      if (btns.length) html += `<div class="top-row" style="--selector-scale:${clamp(Number(c.selectors_size) || 100, 50, 200) / 100}">${btns.join('')}</div>`;
    }

    let central = '';
    if (c.central_heating_entity && usable(h.states[c.central_heating_entity])) {
      const st = h.states[c.central_heating_entity];
      const n = parseFloat(st.state);
      const hasN = !Number.isNaN(n);
      const active = hasN ? n > 0 : st.state !== '0' && st.state !== 'off' && st.state !== 'unavailable';
      const unit = st.attributes.unit_of_measurement || tr(h, 'valvole', 'valves');
      const text = hasN ? `${n} ${unit} ${tr(h, 'attive', 'active')}` : st.state;
      const color = active ? 'red' : 'limegreen';
      central = `<div class="central-status ${active ? 'blink' : ''}" data-role="central-status" data-entity="${esc(c.central_heating_entity)}" style="color:${color};box-shadow:0 0 12px 3px ${color};">
        <span>${esc(c.central_heating_label || tr(h, 'Riscaldamento centralizzato', 'Central heating'))} — ${esc(text)}</span></div>`;
    }

    let chips = '';
    for (const [kind, ent] of [['manual_auto', c.manual_auto_entity], ['season', c.season_entity]]) {
      if (!ent) continue;
      const st = h.states[ent];
      if (!usable(st)) continue;
      const r = resolveChip(kind, c, st, h);
      const cap = CHIP_KINDS[kind].cap;
      chips += `<div class="mchip" data-role="chip" data-entity="${esc(ent)}" title="${esc(st.attributes.friendly_name || ent)}" style="color:${r.color};border-color:${r.color};box-shadow:0 0 8px ${r.color};">
        <ha-icon icon="${esc(r.icon)}"></ha-icon><span class="mc-t"><span class="mc-cap">${esc(tr(h, cap[0], cap[1]))}</span><span>${esc(r.label)}</span></span></div>`;
    }
    if (central || chips) html += `<div class="central-row">${central}${chips}</div>`;

    const tiers = [
      ['massima', c.temperature_max_entity, c.humidity_max_entity],
      ['media', c.temperature_avg_entity, c.humidity_avg_entity],
      ['minima', c.temperature_min_entity, c.humidity_min_entity],
    ];
    const labels = isItalian(h)
      ? { massima: 'Temperatura massima', media: 'Temperatura media', minima: 'Temperatura minima' }
      : { massima: 'Maximum temperature', media: 'Average temperature', minima: 'Minimum temperature' };
    const humidityLabels = isItalian(h)
      ? { massima: 'Umidità massima', media: 'Umidità media', minima: 'Umidità minima' }
      : { massima: 'Maximum humidity', media: 'Average humidity', minima: 'Minimum humidity' };
    
    let row = '';
    for (const [tierLabel, tEnt, hEnt] of tiers) {
      if (tEnt) {
        const val = numState(h, tEnt);
        if (val !== null) {
          const col = tempColor(val, c.temp_thresholds);
          row += `<div class="stat-chip" style="color:${col}; border-color:${col};">${labels[tierLabel]} ${fmt(val, '°C')}</div>`;
        }
      }
      if (hEnt) {
        const val = numState(h, hEnt);
        if (val !== null) {
          const col = humColor(val, c.humidity_thresholds);
          row += `<div class="stat-chip" style="color:${col}; border-color:${col};">${humidityLabels[tierLabel]} ${fmt(val, '%')}</div>`;
        }
      }
    }
    if (row) html += `<div class="stats-row">${row}</div>`;

    if (html !== this._gsig) {
      this._gsig = html;
      this._gtop.innerHTML = html;
    }
  }

  _onGlobalClick(ev) {
    const path = ev.composedPath ? ev.composedPath() : [ev.target];
    const t = path.find((n) => n && n.dataset && n.dataset.role);
    if (!t || !this._hass) return;
    const c = this._config;
    if (t.dataset.role === 'mode-btn') {
      const helper = this._hass.states[c.mode_entity];
      if (!usable(helper)) return;
      const options = helper.attributes && helper.attributes.options;
      const wanted = t.dataset.option;
      const option = Array.isArray(options) ? options.find((o) => normOpt(o) === normOpt(wanted)) : wanted;
      if (option === undefined) return;
      this._hass.callService('input_select', 'select_option', { entity_id: c.mode_entity, option });
    } else if (t.dataset.role === 'central-status') {
      this._moreInfo(t.dataset.entity);
    } else if (t.dataset.role === 'chip') {
      if (this._held) {
        this._held = false;
        return;
      }
      if (c.modes_readonly) this._moreInfo(t.dataset.entity);
      else this._activateChip(t.dataset.entity);
    }
  }

  _moreInfo(entityId) {
    if (entityId) this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
  }

  _activateChip(id) {
    const h = this._hass;
    const st = h.states[id];
    if (!usable(st)) return;
    const domain = id.split('.')[0];
    if (domain === 'input_boolean' || domain === 'switch') {
      h.callService(domain, 'toggle', { entity_id: id });
    } else if (domain === 'input_select' || domain === 'select') {
      const opts = st.attributes && st.attributes.options;
      if (Array.isArray(opts) && opts.length > 1) {
        const i = opts.findIndex((o) => o === st.state);
        h.callService(domain, 'select_option', { entity_id: id, option: opts[(i + 1) % opts.length] });
      } else {
        this._moreInfo(id);
      }
    } else {
      this._moreInfo(id);
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) return;
    try {
      this._renderGlobal();
      this._views.forEach((v) => v.update());
      this._titleEl.textContent = this._config.title || '';
      this._titleEl.style.display = this._config.title ? '' : 'none';
      this._updateChips();
    } catch (e) {
      console.error('thermo-orb-card: errore di aggiornamento', e);
    }
    this._start();
  }

  _updateChips() {
    const c = this._config;
    const gs = this._groups;
    if (c.layout === 'grid' || !gs.length) return;
    const live = (v) => !!(v._vmc && v._vmc.on && v._vmc.action && !['idle', 'off'].includes(v._vmc.action));
    const items = gs.map((g) => ({ id: g.id, label: g.name || 'Altre', icon: g.icon, live: this._views.some((v) => v.g === g && live(v)) }));
    const sel = this._rooms.find((rm) => rm.g.id === this._sel);
    const devs = sel && sel.g.entities.length > 1 ? sel.views.map((v) => ({ id: v.entity, label: v.displayName(), live: live(v) })) : [];
    const sig = JSON.stringify([items, devs, this._sel, this._dev]);
    if (sig === this._csig) return;
    this._csig = sig;
    chipsInto(this._chips, items, this._sel, (id) => {
      this._sel = id;
      this._csig = null;
      this._applyLayout();
      this._updateChips();
    });
    this._rooms.forEach((rm) => {
      if (rm !== sel) rm.dev.innerHTML = '';
    });
    if (sel) {
      chipsInto(sel.dev, devs, this._dev[sel.g.id], (id) => {
        this._dev[sel.g.id] = id;
        this._csig = null;
        this._applyLayout();
        this._updateChips();
      });
    }
    const first = this._views.find((v) => v.shown && v._tgt);
    if (first) this._card.style.setProperty('--acc', `rgb(${first._tgt.col.join(',')})`);
  }

  _start() {
    if (this._raf || !this._on || this._vis === false) return;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }
  _loop(ts) {
    this._raf = null;
    if (!this._on || this._vis === false) return;
    const dt = Math.max(0, Math.min(0.05, (ts - this._last) / 1000));
    this._last = ts;
    for (const v of this._views) {
      if (!v.shown) continue;
      try {
        v.frame(dt);
      } catch (e) {
        console.error('thermo-orb-card: errore di disegno', e);
      }
    }
    this._raf = requestAnimationFrame(this._loop);
  }
}

const sensorSel = (name) => ({ name, selector: { entity: { domain: 'sensor' } } });
const MODE_SCHEMA = [
  { type: 'grid', name: '', schema: [{ name: 'option', selector: { text: {} } }, { name: 'label', selector: { text: {} } }] },
  { type: 'grid', name: '', schema: [{ name: 'icon', selector: { icon: {} } }, { name: 'color', selector: { color_rgb: {} } }] },
];
const MODE_LABELS = { option: "Valore stato (opzione dell'input_select)", label: 'Etichetta', icon: 'Icona', color: 'Colore' };
const migrateRooms = (c) => {
  const cfg = JSON.parse(JSON.stringify(c || {}));
  (cfg.rooms || []).forEach((r) => {
    if (r.climate_entity) {
      r.entities = r.entities || [];
      if (!r.entities.some((e) => (typeof e === 'string' ? e : e.entity) === r.climate_entity)) r.entities.unshift(r.climate_entity);
    }
    delete r.climate_entity;
  });
  return cfg;
};

class ThermoEditor extends makeRoomsEditor({
  domains: ['climate', 'humidifier', 'fan'],
  defaults: (cfg) => ({ layout: (cfg.rooms || []).some((r) => r.climate_entity) || cfg.columns ? 'grid' : 'select', target_size: 100, current_size: 100, room_chips_size: 100, step_buttons_size: 100, selectors_size: 100 }),
  looseLabel: 'Dispositivi senza stanza (opzionale)',
  roomExtra: [
    { name: 'orb_columns', selector: { number: { min: 1, mode: 'box' } } },
    sensorSel('temperature_entity'),
    sensorSel('humidity_entity'),
  ],
  schema: [
    { name: 'title', selector: { text: {} } },
    { name: 'layout', selector: { select: { options: LAYOUTS, mode: 'dropdown' } } },
    { name: 'room_columns', selector: { number: { min: 1, mode: 'box' } } },
    { name: 'entity_columns', selector: { number: { min: 1, mode: 'box' } } },
    { type: 'grid', name: '', schema: [
      { name: 'current_size', selector: { number: { min: 50, max: 200, step: 5, mode: 'slider', unit_of_measurement: '%' } } },
      { name: 'target_size', selector: { number: { min: 50, max: 200, step: 5, mode: 'slider', unit_of_measurement: '%' } } },
    ] },
    { name: 'room_chips_size', selector: { number: { min: 50, max: 200, step: 5, mode: 'slider', unit_of_measurement: '%' } } },
    { type: 'grid', name: '', schema: [
      { name: 'step_buttons_size', selector: { number: { min: 50, max: 200, step: 5, mode: 'slider', unit_of_measurement: '%' } } },
      { name: 'selectors_size', selector: { number: { min: 50, max: 200, step: 5, mode: 'slider', unit_of_measurement: '%' } } },
    ] },
    { type: 'grid', name: '', schema: [
      { name: 'orb_color', selector: { color_rgb: {} } },
      { name: 'orb_color_auto', selector: { color_rgb: {} } },
    ] },
    { type: 'grid', name: '', schema: [
      { name: 'orb_color_manual', selector: { color_rgb: {} } },
      { name: 'orb_color_off', selector: { color_rgb: {} } },
    ] },
    { type: 'grid', name: '', schema: [
      { name: 'orb_color_heat', selector: { color_rgb: {} } },
      { name: 'orb_color_heat_demand', selector: { color_rgb: {} } },
    ] },
    { name: 'orb_color_cool', selector: { color_rgb: {} } },
    { type: 'grid', name: '', schema: [
      { name: 'orb_color_dry', selector: { color_rgb: {} } },
      { name: 'orb_color_humid', selector: { color_rgb: {} } },
    ] },
    { name: 'orb_color_fan', selector: { color_rgb: {} } },
    { name: 'mode_entity', selector: { entity: { domain: 'input_select' } } },
    { type: 'grid', name: '', schema: [sensorSel('central_heating_entity'), { name: 'central_heating_label', selector: { text: {} } }] },
    { type: 'grid', name: '', schema: [
      { name: 'manual_auto_entity', selector: { entity: { domain: ['input_select', 'select', 'input_boolean', 'switch', 'binary_sensor', 'sensor'] } } },
      { name: 'season_entity', selector: { entity: { domain: ['input_select', 'select', 'input_boolean', 'switch', 'binary_sensor', 'sensor'] } } },
    ] },
    { name: 'modes_readonly', selector: { boolean: {} } },
    { type: 'grid', name: '', schema: [sensorSel('temperature_max_entity'), sensorSel('temperature_avg_entity'), sensorSel('temperature_min_entity')] },
    { type: 'grid', name: '', schema: [sensorSel('humidity_max_entity'), sensorSel('humidity_avg_entity'), sensorSel('humidity_min_entity')] },
  ],
  labels: {
    title: 'Titolo', entity_columns: 'Entità senza stanza per riga (nessun limite fisso)', current_size: 'Grandezza temperatura ATTUALE (cifra grande %)', target_size: 'Grandezza temperatura IMPOSTATA (testo in basso %)',
    room_chips_size: 'Grandezza chip temperatura/umidità stanza (%)',
    step_buttons_size: 'Grandezza pulsanti + e − (%)', selectors_size: 'Grandezza selettori modalità e controlli (%)',
    orb_color: 'Colore globale Orb (fallback)', orb_color_auto: 'Colore Orb: Auto',
    orb_color_manual: 'Colore Orb: Manuale', orb_color_off: 'Colore Orb: Spento',
    orb_color_heat: 'Colore Orb: Riscaldamento', orb_color_heat_demand: 'Colore Orb: Valvola che richiede calore',
    orb_color_cool: 'Colore Orb: Raffrescamento',
    orb_color_dry: 'Colore Orb: Deumidificazione', orb_color_humid: 'Colore Orb: Umidificazione',
    orb_color_fan: 'Colore Orb: Ventola',
    manual_auto_entity: 'Modo manuale/automatico (opzionale)', season_entity: 'Stagione estate/inverno (opzionale)',
    modes_readonly: 'Chip modo e stagione in sola lettura (il tocco apre i dettagli)',
    mode_entity: 'Modalità globale (input_select, opzionale)', central_heating_entity: 'Sensore n° valvole attive (opzionale)', central_heating_label: 'Etichetta stato centrale',
    temperature_max_entity: 'Temperatura massima', temperature_avg_entity: 'Temperatura media', temperature_min_entity: 'Temperatura minima',
    humidity_max_entity: 'Umidità massima', humidity_avg_entity: 'Umidità media', humidity_min_entity: 'Umidità minima',
    temperature_entity: 'Sensore temperatura della stanza (opzionale)', humidity_entity: 'Sensore umidità della stanza (opzionale)',
    entities: 'Dispositivi (climate / humidifier / fan)',
  },
}) {
  setConfig(c) {
    super.setConfig(migrateRooms(c));
  }

  _draw() {
    super._draw();
    this._drawModes();
  }

  _drawModes() {
    const xt = this.shadowRoot.querySelector('.xtra');
    if (!xt) return;
    const list = () => this._gen.mode_options || DEFAULT_MODE_OPTIONS.map((m) => ({ ...m }));
    const paint = () => {
      xt.innerHTML = `<div class="sh">Pulsanti modalità globali</div><p class="hint">Compaiono in alto se hai scelto la modalità globale (input_select). "Valore stato" è l'opzione dell'input_select.</p>
        <div class="mlist"></div><button class="add" type="button"><ha-icon icon="mdi:plus"></ha-icon>Aggiungi modalità</button>`;
      const box = xt.querySelector('.mlist');
      list().forEach((m, i) => {
        const d = document.createElement('div');
        d.className = 'room';
        d.innerHTML = `<div class="rh"><span class="idx">${i + 1}</span><span class="rn"></span><span class="sp"></span><button type="button" data-a="del" title="Rimuovi modalità"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div><div class="rf"></div>`;
        d.querySelector('.rn').textContent = m.label || m.option || `Modalità ${i + 1}`;
        const f = document.createElement('ha-form');
        f.hass = this._hass;
        f.computeLabel = (s) => MODE_LABELS[s.name] || s.name;
        f.schema = MODE_SCHEMA;
        f.data = { ...m, color: parseColor(m.color, [136, 136, 136]) };
        f.addEventListener('value-changed', (e) => {
          e.stopPropagation();
          const arr = list();
          arr[i] = { ...arr[i], ...(e.detail.value || {}) };
          this._gen.mode_options = arr;
          d.querySelector('.rn').textContent = arr[i].label || arr[i].option || `Modalità ${i + 1}`;
          this._emit();
        });
        d.querySelector('.rf').appendChild(f);
        d.querySelector('button[data-a=del]').addEventListener('click', () => {
          const arr = list();
          arr.splice(i, 1);
          this._gen.mode_options = arr;
          this._emit();
          paint();
        });
        box.appendChild(d);
      });
      xt.querySelector('.add').addEventListener('click', () => {
        this._gen.mode_options = [...list(), { option: '', label: '', icon: 'mdi:circle', color: [136, 136, 136] }];
        this._emit();
        paint();
      });
    };
    paint();
  }
}

customElements.define('thermo-orb-card', ThermoOrbCard);
customElements.define('thermo-orb-card-editor', ThermoEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'thermo-orb-card',
  name: 'Thermo Orb (clima 3D)',
  description: 'Panoramica climatica con orb 3D: modalità globale, valvole attive, statistiche di temperatura/umidità e una stanza per ogni orb.',
  preview: true,
});