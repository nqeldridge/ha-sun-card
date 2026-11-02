/**
 * Sun Year Card — a Home Assistant Lovelace card
 * Shows sunrise and sunset across the year, with today's and tomorrow's times,
 * a countdown to the next clock change, and markers for the earliest/latest
 * sunset, today, and the next later sunset / earlier sunrise.
 *
 * No integrations or sensors needed: location and time zone come from Home Assistant.
 */
const SUN_YEAR_CARD_VERSION = "1.0.0";

const DAY = 86400000;
const RAD = Math.PI / 180;

const STYLE = `
  :host { display: block; }
  ha-card { padding: 16px; display: grid; gap: 16px; overflow: hidden; }
  header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 1.25rem; font-weight: 500; color: var(--primary-text-color); letter-spacing: -0.005em; }
  .now { font-size: .875rem; color: var(--secondary-text-color); }
  .now b { color: var(--primary-text-color); font-weight: 500; font-variant-numeric: tabular-nums; }

  .stats { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 8px; }
  .tile { background: var(--sy-tile); border-radius: 12px; padding: 10px 12px; display: grid; gap: 6px; align-content: start; min-width: 0; }
  .label { font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; color: var(--secondary-text-color); font-weight: 600; }
  .rows { display: grid; gap: 3px; }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: .9rem; }
  .row .k { color: var(--secondary-text-color); display: flex; align-items: center; gap: 6px; }
  .row .v { font-variant-numeric: tabular-nums; font-weight: 500; white-space: nowrap; color: var(--primary-text-color); }
  .d { font-size: .75rem; color: var(--secondary-text-color); margin-left: 4px; font-weight: 400; }
  .sw { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
  .sw.rise { background: var(--sy-rise); } .sw.set { background: var(--sy-set); }
  .count { font-size: 1.6rem; font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; color: var(--primary-text-color); white-space: nowrap; }
  .count small { font-size: .8rem; font-weight: 500; color: var(--secondary-text-color); margin-left: 1px; }

  .chart { position: relative; min-width: 0; }
  .chart svg { display: block; width: 100%; touch-action: pan-y; }
  .chart text { font-size: 10.5px; fill: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .chart text.lbl { font-size: 11px; font-weight: 600; fill: var(--primary-text-color); }
  .tip { position: absolute; pointer-events: none; background: var(--card-background-color, var(--ha-card-background, #fff));
    border: 1px solid var(--divider-color); border-radius: 8px; padding: 6px 9px; font-size: .78rem;
    box-shadow: 0 4px 14px rgba(0,0,0,.15); white-space: nowrap; color: var(--primary-text-color); z-index: 1; }
  .tip b { display: block; font-weight: 600; margin-bottom: 2px; }
  .tip span { font-variant-numeric: tabular-nums; color: var(--secondary-text-color); }

  .keys { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin: 0; padding: 0; list-style: none; }
  .keys li { display: grid; grid-template-columns: 14px 1fr; gap: 8px; font-size: .85rem; align-items: start; color: var(--primary-text-color); }
  .keys .k { color: var(--secondary-text-color); }
  .keys .when { font-variant-numeric: tabular-nums; }
  .dot { width: 9px; height: 9px; margin-top: 4px; border-radius: 50%; box-sizing: border-box; border: 2px solid var(--sy-mark); background: var(--sy-mark); }
  .dot.rise { background: var(--sy-rise); border-color: var(--sy-rise); }
  .dot.set { background: var(--sy-set); border-color: var(--sy-set); }
  .dot.ring { background: transparent; }
  .err { color: var(--error-color, #db4437); font-size: .9rem; }

  @container (max-width: 440px) {
    .row { align-items: start; }
    .row .v { display: grid; justify-items: end; }
    .d { margin-left: 0; }
  }
  @container (max-width: 520px) {
    .stats { grid-template-columns: 1fr 1fr; }
    .stats .dst { grid-column: 1 / -1; }
    .keys { grid-template-columns: 1fr; }
  }
  ha-card { container-type: inline-size; }
`;

class SunYearCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._key = null;
    this._model = null;
    this._lastWidth = 0;
  }

  /* ---------- Home Assistant card API ---------- */

  static getStubConfig() {
    return { title: "Sun Year" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "show_legend", selector: { boolean: {} } },
        { name: "show_countdown", selector: { boolean: {} } },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "latitude", selector: { number: { min: -90, max: 90, step: "any", mode: "box" } } },
            { name: "longitude", selector: { number: { min: -180, max: 180, step: "any", mode: "box" } } },
          ],
        },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "sunrise_color", selector: { text: {} } },
            { name: "sunset_color", selector: { text: {} } },
          ],
        },
      ],
      computeLabel: (s) =>
        ({
          title: "Title",
          show_legend: "Show key dates below the chart",
          show_countdown: "Show time change countdown",
          latitude: "Latitude (optional override)",
          longitude: "Longitude (optional override)",
          sunrise_color: "Sunrise color (optional)",
          sunset_color: "Sunset color (optional)",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this._config = { title: "Sun Year", show_legend: true, show_countdown: true, ...config };
    this._key = null;
    this._skeleton();
    if (this._hass) this.hass = this._hass;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const s = this._settings();
    const key = JSON.stringify(s) + (this._config.title || "");
    if (key !== this._key) {
      this._key = key;
      this._applyTheme(s);
      this._full();
    }
  }

  getCardSize() {
    return this._config && this._config.show_legend === false ? 6 : 8;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  connectedCallback() {
    this._tickTimer = setInterval(() => this._tick(), 1000);
    this._minuteTimer = setInterval(() => this._minute(), 60000);
    if (!this._ro && "ResizeObserver" in window) {
      this._ro = new ResizeObserver(() => {
        const el = this.shadowRoot.querySelector(".chart");
        const w = el ? el.clientWidth : 0;
        if (w && Math.abs(w - this._lastWidth) > 2) this._chart();
      });
    }
    const el = this.shadowRoot.querySelector(".chart");
    if (this._ro && el) this._ro.observe(el);
    if (this._model) this._chart();
  }

  disconnectedCallback() {
    clearInterval(this._tickTimer);
    clearInterval(this._minuteTimer);
    if (this._ro) this._ro.disconnect();
  }

  /* ---------- settings ---------- */

  _settings() {
    const h = this._hass || {};
    const c = this._config || {};
    const hc = h.config || {};
    const loc = h.locale || {};
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tz = loc.time_zone === "local" ? browserTz : hc.time_zone || browserTz;
    let hour12; // undefined = language default
    if (loc.time_format === "12") hour12 = true;
    else if (loc.time_format === "24") hour12 = false;
    else if (loc.time_format === "system") hour12 = Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12;
    const num = (v, d) => (v === undefined || v === null || v === "" || isNaN(+v) ? d : +v);
    return {
      lat: num(c.latitude, hc.latitude),
      lon: num(c.longitude, hc.longitude),
      tz,
      lang: loc.language || h.language || "en",
      hour12,
      dark: !!(h.themes && h.themes.darkMode),
      rise: c.sunrise_color || null,
      set: c.sunset_color || null,
    };
  }

  _applyTheme(s) {
    const rise = s.rise || (s.dark ? "#f1bf45" : "#c9900d");
    const set = s.set || (s.dark ? "#e07fcd" : "#a03f8c");
    const st = this.style;
    st.setProperty("--sy-rise", rise);
    st.setProperty("--sy-set", set);
    st.setProperty("--sy-today", "var(--primary-color, #03a9f4)");
    st.setProperty("--sy-mark", "var(--primary-text-color, #212121)");
    st.setProperty("--sy-tile", "color-mix(in srgb, var(--primary-text-color, #212121) 5%, transparent)");
    st.setProperty("--sy-night", `color-mix(in srgb, var(--primary-text-color, #212121) ${s.dark ? 5 : 7}%, transparent)`);
    st.setProperty("--sy-grid", "color-mix(in srgb, var(--primary-text-color, #212121) 10%, transparent)");
    st.setProperty("--sy-day-a", `color-mix(in srgb, ${rise} ${s.dark ? 30 : 32}%, transparent)`);
    st.setProperty("--sy-day-b", `color-mix(in srgb, ${set} ${s.dark ? 28 : 24}%, transparent)`);
  }

  /* ---------- DOM ---------- */

  _skeleton() {
    const c = this._config;
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        <header>
          <h1>${escapeHtml(c.title || "")}</h1>
          <div class="now"></div>
        </header>
        <section class="stats">
          <div class="tile"><div class="label">Today</div><div class="rows today"></div></div>
          <div class="tile"><div class="label">Tomorrow</div><div class="rows tomorrow"></div></div>
          ${c.show_countdown === false ? "" : `<div class="tile dst"><div class="label">Next time change</div><div class="count">\u2013</div></div>`}
        </section>
        <div class="chart"><div class="tip" hidden></div></div>
        ${c.show_legend === false ? "" : `<ul class="keys"></ul>`}
      </ha-card>`;
    if (!c.title) this.shadowRoot.querySelector("h1").remove();
    if (c.show_countdown === false) this.shadowRoot.querySelector(".stats").style.gridTemplateColumns = "1fr 1fr";
    const el = this.shadowRoot.querySelector(".chart");
    if (this._ro && el && this.isConnected) this._ro.observe(el);
  }

  _$(sel) {
    return this.shadowRoot.querySelector(sel);
  }

  /* ---------- time helpers (bound to the configured time zone) ---------- */

  _initFormatters(s) {
    const tz = s.tz;
    this._pf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
    });
    const timeOpts = { timeZone: tz, hour: "numeric", minute: "2-digit" };
    if (s.hour12 !== undefined) timeOpts.hour12 = s.hour12;
    this._fTime = new Intl.DateTimeFormat(s.lang, timeOpts);
    this._h12 = this._fTime.resolvedOptions().hour12 !== false;
    this._fDate = new Intl.DateTimeFormat(s.lang, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
    this._fMon = new Intl.DateTimeFormat(s.lang, { timeZone: "UTC", month: "short" });
  }

  _parts(t) {
    const o = {};
    for (const p of this._pf.formatToParts(t)) o[p.type] = p.value;
    return o;
  }

  _offMin(t) {
    const o = this._parts(t);
    return Math.round((Date.UTC(+o.year, o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second) - t) / 60000);
  }

  _clockMin(t) {
    const d = new Date(t + this._offMin(t) * 60000);
    return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  }

  // Sunrise equation. Returns UTC ms for rise/set on local calendar date y-m-d.
  _sun(y, m, d) {
    const { lat, lon } = this._s;
    const n = Math.round(Date.UTC(y, m, d, 12) / DAY + 2440587.5 - 2451545);
    const Js = n + 0.0008 - lon / 360;
    const M = (((357.5291 + 0.98560028 * Js) % 360) + 360) % 360;
    const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
    const L = (M + C + 180 + 102.9372) % 360;
    const Jt = 2451545 + Js + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * L * RAD);
    const sd = Math.sin(L * RAD) * Math.sin(23.4397 * RAD);
    const cd = Math.cos(Math.asin(sd));
    const cw = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sd) / (Math.cos(lat * RAD) * cd);
    if (cw > 1 || cw < -1) return null; // polar night / midnight sun
    const w = Math.acos(cw) / RAD / 360;
    const toMs = (J) => (J - 2440587.5) * DAY;
    const rise = toMs(Jt - w);
    const set = toMs(Jt + w);
    return { rise, set, len: (set - rise) / 60000, riseC: this._clockMin(rise), setC: this._clockMin(set) };
  }

  _findChange(from) {
    const o0 = this._offMin(from);
    let t = from;
    for (let i = 0; i < 400; i++) {
      const t2 = t + DAY;
      if (this._offMin(t2) !== o0) {
        let a = t, b = t2;
        while (b - a > 1000) {
          const mid = Math.round((a + b) / 2);
          if (this._offMin(mid) === o0) a = mid; else b = mid;
        }
        return { at: b };
      }
      t = t2;
    }
    return null;
  }

  /* ---------- model ---------- */

  _build() {
    const now = Date.now();
    const p = this._parts(now);
    const ty = +p.year, tm = p.month - 1, td = +p.day;
    const todayUTC = Date.UTC(ty, tm, td);
    const startUTC = Date.UTC(ty, tm - 3, 1);
    const endUTC = Date.UTC(ty, tm + 9, 1);
    const N = Math.round((endUTC - startUTC) / DAY);
    const dayOf = (base, i) => { const t = new Date(base + i * DAY); return [t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()]; };

    const days = [];
    for (let i = 0; i < N; i++) {
      const [y, m, d] = dayOf(startUTC, i);
      days.push({ y, m, d, utc: Date.UTC(y, m, d), s: this._sun(y, m, d) });
    }
    const ti = Math.round((todayUTC - startUTC) / DAY);
    const today = this._sun(ty, tm, td);
    const tomorrow = this._sun(...dayOf(todayUTC, 1));

    let earliest = null, latest = null;
    days.forEach((d, i) => {
      if (!d.s) return;
      if (earliest == null || d.s.setC < days[earliest].s.setC) earliest = i;
      if (latest == null || d.s.setC > days[latest].s.setC) latest = i;
    });

    let laterSet = null, earlierRise = null;
    if (today) {
      for (let k = 1; k < 400 && (!laterSet || !earlierRise); k++) {
        const [y, m, d] = dayOf(todayUTC, k);
        const s = this._sun(y, m, d);
        if (!s) continue;
        if (!laterSet && Math.floor(s.setC) > Math.floor(today.setC)) laterSet = { k, utc: Date.UTC(y, m, d), s };
        if (!earlierRise && Math.floor(s.riseC) < Math.floor(today.riseC)) earlierRise = { k, utc: Date.UTC(y, m, d), s };
      }
    }

    const shifts = [];
    for (let i = 1; i < N; i++) {
      const a = this._offMin(days[i - 1].utc + 12 * 3600000);
      const b = this._offMin(days[i].utc + 12 * 3600000);
      if (a !== b) shifts.push({ i, dir: b > a ? 1 : -1 });
    }

    this._model = {
      now, days, N, ti, startUTC, todayUTC, today, tomorrow,
      earliest, latest, laterSet, earlierRise, shifts, next: this._findChange(now),
    };
  }

  _full() {
    const s = this._settings();
    if (!isFinite(s.lat) || !isFinite(s.lon)) {
      this._$(".chart").innerHTML = `<div class="err">Set a home location in Home Assistant, or add latitude and longitude to this card.</div>`;
      return;
    }
    this._s = s;
    try {
      this._initFormatters(s);
    } catch (e) {
      this._s.tz = "UTC";
      this._initFormatters(this._s);
    }
    this._build();
    this._stats();
    this._keys();
    this._chart();
    this._tick();
  }

  _minute() {
    if (!this._model || !this._s) return;
    const p = this._parts(Date.now());
    if (Date.UTC(+p.year, p.month - 1, +p.day) !== this._model.todayUTC) this._full();
    else this._stats();
  }

  /* ---------- rendering ---------- */

  _stats() {
    const m = this._model, a = m.today, b = m.tomorrow, now = Date.now();
    const t = (ms) => this._fTime.format(ms);
    const row = (cls, k, v, d = "") =>
      `<div class="row"><span class="k"><i class="sw ${cls}"></i>${k}</span><span class="v">${v}${d ? `<span class="d">${d}</span>` : ""}</span></div>`;
    this._$(".today").innerHTML = a
      ? row("rise", "Sunrise", t(a.rise)) + row("set", "Sunset", t(a.set))
      : `<div class="row"><span class="k">No sunrise today</span></div>`;
    this._$(".tomorrow").innerHTML = b
      ? row("rise", "Sunrise", t(b.rise), a ? fmtDelta(b.riseC - a.riseC) : "") +
        row("set", "Sunset", t(b.set), a ? fmtDelta(b.setC - a.setC) : "")
      : `<div class="row"><span class="k">No sunrise tomorrow</span></div>`;
    let txt = "";
    if (a) {
      if (now < a.rise) txt = `Sunrise in <b>${fmtDur(a.rise - now)}</b>`;
      else if (now < a.set) txt = `Sunset in <b>${fmtDur(a.set - now)}</b>`;
      else if (b) txt = `Sunrise in <b>${fmtDur(b.rise - now)}</b>`;
    }
    this._$(".now").innerHTML = txt;
  }

  _tick() {
    const el = this._$(".count");
    if (!el || !this._model) return;
    const next = this._model.next;
    if (!next) { el.textContent = "No clock changes"; return; }
    const ms = next.at - Date.now();
    if (ms <= 0) { this._full(); return; }
    const s = Math.floor(ms / 1000);
    const dd = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    el.innerHTML = `${dd}<small>d</small> ${hh}<small>h</small> ${pad(mm)}<small>m</small> ${pad(ss)}<small>s</small>`;
  }

  _keys() {
    const ul = this._$(".keys");
    if (!ul) return;
    const m = this._model, out = [];
    const inD = (k) => (k === 0 ? "today" : k === 1 ? "tomorrow" : `in ${k} days`);
    const rel = (i) => inD(Math.round((m.days[i].utc - m.todayUTC) / DAY));
    if (m.earliest != null) {
      const d = m.days[m.earliest];
      out.push(["", "Earliest sunset", `${this._fDate.format(d.utc)} \u00b7 ${this._fTime.format(d.s.set)}`, m.earliest > m.ti ? rel(m.earliest) : ""]);
    }
    if (m.latest != null) {
      const d = m.days[m.latest];
      out.push(["ring", "Latest sunset", `${this._fDate.format(d.utc)} \u00b7 ${this._fTime.format(d.s.set)}`, m.latest > m.ti ? rel(m.latest) : ""]);
    }
    if (m.laterSet) out.push(["set", "Next sunset later than today's", `${this._fDate.format(m.laterSet.utc)} \u00b7 ${this._fTime.format(m.laterSet.s.set)}`, inD(m.laterSet.k)]);
    if (m.earlierRise) out.push(["rise", "Next sunrise earlier than today's", `${this._fDate.format(m.earlierRise.utc)} \u00b7 ${this._fTime.format(m.earlierRise.s.rise)}`, inD(m.earlierRise.k)]);
    ul.innerHTML = out
      .map(([c, k, v, r]) => `<li><i class="dot ${c}"></i><div><div class="k">${k}</div><div class="when">${v}${r ? ` <span class="k">(${r})</span>` : ""}</div></div></li>`)
      .join("");
  }

  _hourLabel(v, narrow) {
    const hr = ((Math.round(v / 60) % 24) + 24) % 24;
    if (!this._h12) return `${pad(hr)}:00`;
    const h = hr % 12 || 12;
    return narrow ? `${h}${hr < 12 ? "a" : "p"}` : `${h} ${hr < 12 ? "AM" : "PM"}`;
  }

  _chart() {
    const el = this._$(".chart");
    const m = this._model;
    if (!el || !m) return;
    const W0 = el.clientWidth;
    if (!W0) return; // not laid out yet; ResizeObserver will call again
    this._lastWidth = W0;
    const W = Math.max(280, W0);
    const H = Math.round(Math.min(360, Math.max(220, W * 0.46)));
    const narrow = W < 480;
    const L = 40, R = 8, T = 24, B = 24, w = W - L - R, h = H - T - B;
    const valid = m.days.filter((d) => d.s);
    if (!valid.length) return;
    const yMin = Math.floor((Math.min(...valid.map((d) => d.s.riseC)) - 50) / 60) * 60;
    const yMax = Math.ceil((Math.max(...valid.map((d) => d.s.setC)) + 50) / 60) * 60;
    const x = (i) => L + (i / (m.N - 1)) * w;
    const y = (v) => T + ((yMax - v) / (yMax - yMin)) * h;
    const f = (n) => n.toFixed(1);
    const uid = "sy" + Math.random().toString(36).slice(2, 8);
    let g = "";

    g += `<defs><linearGradient id="${uid}g" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" style="stop-color:var(--sy-day-a)"/><stop offset="1" style="stop-color:var(--sy-day-b)"/></linearGradient>
        <clipPath id="${uid}c"><rect x="${L}" y="${T}" width="${w}" height="${h}" rx="6"/></clipPath></defs>`;
    g += `<rect x="${L}" y="${T}" width="${w}" height="${h}" rx="6" style="fill:var(--sy-night)"/>`;

    for (let v = yMin; v <= yMax; v += 120) {
      g += `<line x1="${L}" x2="${L + w}" y1="${f(y(v))}" y2="${f(y(v))}" style="stroke:var(--sy-grid)"/>`;
      g += `<text x="${L - 6}" y="${f(y(v) + 3.5)}" text-anchor="end">${this._hourLabel(v, narrow)}</text>`;
    }
    m.days.forEach((d, i) => {
      if (d.d !== 1) return;
      g += `<line x1="${f(x(i))}" x2="${f(x(i))}" y1="${T}" y2="${T + h}" style="stroke:var(--sy-grid)"/>`;
      const lab = this._fMon.format(d.utc);
      g += `<text x="${f(x(i) + (narrow ? 2 : 4))}" y="${T + h + 16}">${narrow ? lab.charAt(0).toUpperCase() : lab}</text>`;
    });

    const pts = m.days.map((d, i) => (d.s ? [x(i), y(d.s.riseC), y(d.s.setC)] : null)).filter(Boolean);
    const band = pts.map((p) => `${f(p[0])},${f(p[1])}`).join(" ") + " " + pts.slice().reverse().map((p) => `${f(p[0])},${f(p[2])}`).join(" ");
    g += `<g clip-path="url(#${uid}c)"><polygon points="${band}" style="fill:url(#${uid}g)"/>`;
    g += `<polyline points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(" ")}" style="fill:none;stroke:var(--sy-rise);stroke-width:2.2;stroke-linejoin:round"/>`;
    g += `<polyline points="${pts.map((p) => `${f(p[0])},${f(p[2])}`).join(" ")}" style="fill:none;stroke:var(--sy-set);stroke-width:2.2;stroke-linejoin:round"/></g>`;

    m.shifts.forEach((s) => {
      const xx = f(x(s.i - 0.5));
      g += `<line x1="${xx}" x2="${xx}" y1="${T}" y2="${T + h}" style="stroke:var(--secondary-text-color);opacity:.6" stroke-dasharray="2 3"/>`;
      g += `<text x="${xx}" y="${T - 8}" text-anchor="middle">${s.dir > 0 ? "+1h" : "\u22121h"}</text>`;
    });

    const anchorFor = (xx, room) => (xx > L + w - room ? "end" : xx < L + room ? "start" : "middle");
    const ext = (i, ring, name, above) => {
      const d = m.days[i], xx = x(i), ys = y(d.s.setC);
      g += `<circle cx="${f(xx)}" cy="${f(ys)}" r="5" style="fill:${ring ? "var(--card-background-color, var(--ha-card-background, #fff))" : "var(--sy-mark)"};stroke:var(--sy-mark);stroke-width:2"/>`;
      const a = anchorFor(xx, 90);
      const y1 = above ? ys - 22 : ys + 18, y2 = above ? ys - 9 : ys + 31;
      g += `<text class="lbl" x="${f(xx)}" y="${f(y1)}" text-anchor="${a}">${name}</text>`;
      g += `<text x="${f(xx)}" y="${f(y2)}" text-anchor="${a}" style="fill:var(--primary-text-color)">${this._fTime.format(d.s.set)}</text>`;
    };
    if (m.earliest != null) ext(m.earliest, false, narrow ? "Earliest" : "Earliest sunset", false);
    if (m.latest != null) ext(m.latest, true, narrow ? "Latest" : "Latest sunset", true);

    const idxOf = (utc) => Math.round((utc - m.startUTC) / DAY);
    const pin = (o, key, color, above, text) => {
      if (!o) return;
      const i = idxOf(o.utc);
      if (i < 0 || i >= m.N) return;
      const xx = x(i), yy = y(o.s[key]);
      g += `<circle cx="${f(xx)}" cy="${f(yy)}" r="5" style="fill:${color};stroke:var(--card-background-color, var(--ha-card-background, #fff));stroke-width:2"/>`;
      const a = xx > L + w - 80 ? "end" : "start";
      g += `<text class="lbl" x="${f(xx + (a === "start" ? 7 : -7))}" y="${f(yy + (above ? -9 : 17))}" text-anchor="${a}" style="fill:${color}">${text}</text>`;
    };
    pin(m.laterSet, "setC", "var(--sy-set)", true, narrow ? "Later" : "Later sunset");
    pin(m.earlierRise, "riseC", "var(--sy-rise)", false, narrow ? "Earlier" : "Earlier sunrise");

    if (m.today && m.ti >= 0 && m.ti < m.N) {
      const xx = f(x(m.ti));
      g += `<line x1="${xx}" x2="${xx}" y1="${T}" y2="${T + h}" style="stroke:var(--sy-today);stroke-width:1.5"/>`;
      for (const v of [m.today.riseC, m.today.setC])
        g += `<circle cx="${xx}" cy="${f(y(v))}" r="5.5" style="fill:var(--sy-today);stroke:var(--card-background-color, var(--ha-card-background, #fff));stroke-width:2"/>`;
      g += `<rect x="${f(x(m.ti) - 22)}" y="${T + h - 20}" width="44" height="16" rx="8" style="fill:var(--sy-today)"/>`;
      g += `<text x="${xx}" y="${T + h - 8.5}" text-anchor="middle" style="fill:var(--text-primary-color, #fff);font-weight:500">Today</text>`;
    }

    g += `<g class="hover" visibility="hidden"><line class="hl" y1="${T}" y2="${T + h}" style="stroke:var(--primary-text-color);stroke-opacity:.35"/>
      <circle class="hr" r="3.5" style="fill:var(--sy-rise)"/><circle class="hs" r="3.5" style="fill:var(--sy-set)"/></g>`;

    const tip = el.querySelector(".tip");
    const old = el.querySelector("svg");
    if (old) old.remove();
    el.insertAdjacentHTML("afterbegin", `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Sunrise and sunset times across the year">${g}</svg>`);
    const svg = el.querySelector("svg");
    const hv = svg.querySelector(".hover"), hl = svg.querySelector(".hl"), hr = svg.querySelector(".hr"), hs = svg.querySelector(".hs");

    const leave = () => { tip.hidden = true; hv.setAttribute("visibility", "hidden"); };
    const move = (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) * W) / r.width;
      const i = Math.round(((px - L) / w) * (m.N - 1));
      const d = m.days[i];
      if (!d || !d.s) return leave();
      hv.setAttribute("visibility", "visible");
      hl.setAttribute("x1", x(i)); hl.setAttribute("x2", x(i));
      hr.setAttribute("cx", x(i)); hr.setAttribute("cy", y(d.s.riseC));
      hs.setAttribute("cx", x(i)); hs.setAttribute("cy", y(d.s.setC));
      tip.innerHTML = `<b>${this._fDate.format(d.utc)}</b><span>\u2191 ${this._fTime.format(d.s.rise)} &nbsp;\u2193 ${this._fTime.format(d.s.set)}<br>${fmtLen(d.s.len)} daylight</span>`;
      tip.hidden = false;
      const sx = (x(i) * r.width) / W, tw = tip.offsetWidth;
      tip.style.left = Math.min(r.width - tw, Math.max(0, sx - tw / 2)) + "px";
      tip.style.top = "0px";
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerleave", leave);
  }
}

/* ---------- formatting helpers ---------- */

function pad(n) { return String(n).padStart(2, "0"); }
function fmtLen(min) { return `${Math.floor(min / 60)}h ${pad(Math.round(min % 60))}m`; }
function fmtDelta(min) {
  const s = Math.round(min * 60), a = Math.abs(s), sg = s > 0 ? "+" : s < 0 ? "\u2212" : "\u00b1";
  return a >= 60 ? `${sg}${Math.floor(a / 60)}m ${a % 60}s` : `${sg}${a}s`;
}
function fmtDur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

if (!customElements.get("sun-year-card")) {
  customElements.define("sun-year-card", SunYearCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "sun-year-card",
    name: "Sun Year Card",
    description: "Sunrise and sunset across the year, with key dates and a time change countdown.",
    preview: true,
  });
  console.info(`%c SUN-YEAR-CARD %c v${SUN_YEAR_CARD_VERSION} `, "background:#c9900d;color:#fff;font-weight:600", "background:#a03f8c;color:#fff");
}
