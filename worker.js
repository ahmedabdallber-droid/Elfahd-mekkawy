// Cloudflare Worker: يجلب آخر نشرة لأسعار الأعلاف في مصر ويرجعها JSON مع CORS
// النشر: Cloudflare Dashboard > Workers & Pages > Create Worker > الصق هذا الكود > Deploy
const TAG_PAGE = "https://www.vetogate.com/keyword/109834"; // صفحة وسم "أسعار الأعلاف اليوم"
const UA = { "User-Agent": "Mozilla/5.0 (compatible; FeedPriceBot/1.0)" };

function toNum(s, thousands) {
  let n = parseFloat(String(s).replace(/,/g, ""));
  if (thousands && n < 1000) n *= 1000;
  return n;
}
// يبحث عن "label ... نحو <رقم> [ألف]"
function pick(text, label, opts = {}) {
  const re = new RegExp(label + "[^\\d]{0,"+(opts.gap||25)+"}?(?:نحو|الطن|للطن)?\\s*(\\d[\\d,\\.]*)\\s*(ألف)?", "u");
  const m = text.match(re);
  if (!m) return null;
  const v = toNum(m[1], !!m[2]);
  const [lo, hi] = opts.range || [1, 1e7];
  return v >= lo && v <= hi ? v : null;
}
export function parseFeeds(text) {
  const t = text.replace(/\s+/g, " ");
  const items = {
    corn_arg:   pick(t, "الذرة أرجنتيني", { range: [5000, 60000] }),
    corn_bra:   pick(t, "الذرة برازيلي", { range: [5000, 60000] }),
    corn_ukr:   pick(t, "الذرة الأوكراني", { range: [5000, 60000], gap: 70 }),
    corn_flake: pick(t, "كورن فلاك[^\\d]{0,30}?سعر الطن", { range: [5000, 80000] }),
    corn_yellow:pick(t, "شيكارة الذرة الصفراء", { range: [100, 5000] }),
    corn_white: pick(t, "طن الذرة البيضاء", { range: [2000, 60000] }),
    soy44:      pick(t, "صويا 44%", { range: [8000, 80000] }),
    soy46:      pick(t, "صويا 46%", { range: [8000, 80000] }),
    soymeal:    pick(t, "كسب صويا مستورد", { range: [8000, 80000] }),
    bran:       pick(t, "طن الردة", { range: [3000, 50000] }),
    glutofeed:  pick(t, "جلوتوفيد محلي", { range: [3000, 50000] }),
    gluten:     pick(t, "جلوتين محلي", { range: [10000, 120000] }),
    sunmeal:    pick(t, "كسب عباد 36%", { range: [5000, 80000] }),
  };
  for (const k in items) if (items[k] === null) delete items[k];
  return items;
}

async function latestArticleUrl() {
  const html = await (await fetch(TAG_PAGE, { headers: UA })).text();
  const re = /<a[^>]+href="(?:https?:\/\/www\.vetogate\.com)?\/(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m, best = 0;
  while ((m = re.exec(html))) {
    if (/أسعار الأعلاف والحبوب/.test(m[2]) && +m[1] > best) best = +m[1];
  }
  return best ? "https://www.vetogate.com/" + best : null;
}

export default {
  async fetch(req, env, ctx) {
    const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=900" };
    try {
      const url = await latestArticleUrl();
      if (!url) throw new Error("no article");
      const html = await (await fetch(url, { headers: UA })).text();
      const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
      const items = parseFeeds(text);
      if (Object.keys(items).length < 5) throw new Error("parse failed");
      const d = (html.match(/published_time:\s*([0-9T:\-]+)/) || [])[1] || "";
      return new Response(JSON.stringify({ items, source: url, date: d.slice(0, 10) }), { headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: cors });
    }
  },
};
