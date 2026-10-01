// Warung Seblak Malampir - API status toko, stok & daftar menu (tanpa bot WA)
// Variable Railway yang dipakai: ADMIN_PIN (PORT otomatis dari Railway)
const http = require("http");
const fs = require("fs");

const PIN = process.env.ADMIN_PIN || "";
const FILE = "/tmp/state.json";
const DEF = {
  paket: [{ n: "Paket Seblak", h: 10000, e: "🍜" }],
  topping: [
    { n: "Kerupuk", h: 1000, e: "🥨" }, { n: "Kwetiau", h: 1000, e: "🍝" }, { n: "Makaroni", h: 1000, e: "🍝" },
    { n: "Mie", h: 1000, e: "🍜" }, { n: "Jamur enoki", h: 2000, e: "🍄" }, { n: "Ceker", h: 2000, e: "🍗" },
    { n: "Tulang", h: 2000, e: "🦴" }, { n: "Sosis", h: 2000, e: "🌭" }, { n: "Baso", h: 2000, e: "🍡" },
    { n: "Dumpling", h: 2000, e: "🥟" }, { n: "Chikuwa", h: 2000, e: "🍥" }, { n: "Kornet", h: 2000, e: "🥫" },
    { n: "Otak-otak", h: 2000, e: "🐟" }, { n: "Telur", h: 3000, e: "🥚" }
  ],
  minuman: [{ n: "Es Teh Jumbo", h: 3000, e: "🧋" }, { n: "Jeruk Peras", h: 5000, e: "🍊" }]
};
let st = { open: false, habis: [], menu: DEF };
try { Object.assign(st, JSON.parse(fs.readFileSync(FILE, "utf8"))); } catch (e) {}

function cleanMenu(m) {
  if (!m || typeof m !== "object") return null;
  const out = {};
  for (const g of ["paket", "topping", "minuman"]) {
    if (!Array.isArray(m[g]) || m[g].length > 60) return null;
    out[g] = [];
    for (const it of m[g]) {
      const h = Number(it && it.h);
      if (!it || typeof it.n !== "string" || !it.n.trim() || it.n.length > 40 || !(h >= 0 && h <= 1000000)) return null;
      out[g].push({ n: it.n.trim(), h: Math.round(h), e: typeof it.e === "string" ? it.e.slice(0, 8) : "" });
    }
  }
  return out;
}

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};
const send = (res, code, obj) => { res.writeHead(code, H); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, H); return res.end(); }
  if (req.url.split("?")[0] !== "/status") return send(res, 404, {});
  if (req.method === "GET") return send(res, 200, st);
  if (req.method !== "POST") return send(res, 405, {});
  let b = "";
  req.on("data", c => { b += c; if (b.length > 40000) req.destroy(); });
  req.on("end", () => {
    try {
      const d = JSON.parse(b);
      if (!PIN || d.pin !== PIN) return send(res, 401, { error: "pin" });
      if (typeof d.open === "boolean") st.open = d.open;
      if (Array.isArray(d.habis)) st.habis = d.habis.filter(x => typeof x === "string").slice(0, 200);
      if (d.menu !== undefined) {
        const m = cleanMenu(d.menu);
        if (!m) return send(res, 400, { error: "menu" });
        st.menu = m;
      }
      try { fs.writeFileSync(FILE, JSON.stringify(st)); } catch (e) {}
      send(res, 200, st);
    } catch (e) { send(res, 400, {}); }
  });
}).listen(process.env.PORT || 3000);
