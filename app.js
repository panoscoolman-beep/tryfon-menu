/* Κοινές βοηθητικές συναρτήσεις για οθόνη, QR menu και admin */

const sb = window.supabase.createClient(TRYFON.SUPABASE_URL, TRYFON.SUPABASE_KEY);

const money = (v) =>
  v === null || v === undefined || v === '' ? '' : Number(v).toFixed(2).replace('.', ',') + ' €';

/* ---------- Θέματα οθόνης ---------- */
const THEMES = {
  taverna:  { name: 'Ταβέρνα',  ink:'#12100e', bg2:'#221c17', text:'#f6efe4', muted:'#a4917a', accent:'#d98d4a', olive:'#8a9a63', line:'rgba(246,239,228,.13)' },
  anthraki: { name: 'Ανθρακί',  ink:'#15171b', bg2:'#242931', text:'#eef1f5', muted:'#94a1ae', accent:'#e8a33d', olive:'#7fa88a', line:'rgba(238,241,245,.14)' },
  aigaio:   { name: 'Αιγαίο',   ink:'#0c1a24', bg2:'#153241', text:'#eef5f8', muted:'#8fa9b8', accent:'#e0a458', olive:'#6fb0a8', line:'rgba(238,245,248,.15)' },
  ladi:     { name: 'Λαδί',     ink:'#12160e', bg2:'#212b18', text:'#f1efe1', muted:'#a5a98b', accent:'#cdba52', olive:'#9fb56a', line:'rgba(241,239,225,.14)' },
  krasi:    { name: 'Κρασί',    ink:'#1a0f11', bg2:'#2e1a1d', text:'#f7ecea', muted:'#b1928f', accent:'#d9705e', olive:'#9aa86b', line:'rgba(247,236,234,.14)' },
  harti:    { name: 'Χαρτί',    ink:'#f4ece0', bg2:'#fdf8f0', text:'#241d16', muted:'#7d6b56', accent:'#a8541f', olive:'#5f7040', line:'rgba(36,29,22,.16)' }
};

/* ---------- Γραμματοσειρές (όλες με ελληνικούς χαρακτήρες) ---------- */
const FONTS = {
  classic:  { name:'Κλασικό',     head:"'Alegreya',Georgia,serif",        body:"'Roboto',system-ui,sans-serif",
              css:'family=Alegreya:wght@500;700&family=Roboto:wght@400;500;700' },
  garamond: { name:'Παραδοσιακό', head:"'EB Garamond',Georgia,serif",     body:"'Fira Sans',system-ui,sans-serif",
              css:'family=EB+Garamond:wght@500;700&family=Fira+Sans:wght@400;500;700' },
  modern:   { name:'Μοντέρνο',    head:"'Fira Sans',system-ui,sans-serif", body:"'Fira Sans',system-ui,sans-serif",
              css:'family=Fira+Sans:wght@400;500;700' },
  slab:     { name:'Δυνατό',      head:"'Roboto Slab',Georgia,serif",     body:"'Roboto',system-ui,sans-serif",
              css:'family=Roboto+Slab:wght@500;700&family=Roboto:wght@400;500;700' }
};

const loadedFonts = new Set();
function loadFont(key) {
  const f = FONTS[key] || FONTS.classic;
  if (loadedFonts.has(key)) return f;
  loadedFonts.add(key);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?' + f.css + '&display=swap&subset=greek';
  document.head.appendChild(l);
  return f;
}

/* Εφαρμόζει θέμα + γραμματοσειρά. Το ?theme= / ?font= στο URL υπερισχύει (για προεπισκόπηση). */
function applyLook(settings, opts) {
  const q = new URLSearchParams(location.search);
  const themeKey = q.get('theme') || settings.theme || 'taverna';
  const fontKey = q.get('font') || settings.font || 'classic';
  const t = THEMES[themeKey] || THEMES.taverna;
  const f = loadFont(FONTS[fontKey] ? fontKey : 'classic');
  const r = document.documentElement.style;

  r.setProperty('--fh', f.head);
  r.setProperty('--fb', f.body);

  if (opts && opts.fontOnly) return;

  // Φόντο εικόνας + πέπλο ώστε να παραμένει ευανάγνωστο
  const bg = q.has('bg') ? q.get('bg') : (settings.bg_url || '');
  const dim = q.has('dim') ? Number(q.get('dim')) : (settings.bg_dim ?? 70);
  if (bg) {
    r.setProperty('--bgimg', 'url("' + bg.replace(/"/g, '%22') + '")');
    r.setProperty('--bgdisp', 'block');
    r.setProperty('--dim', Math.min(95, Math.max(20, dim)) / 100);
  } else {
    r.setProperty('--bgdisp', 'none');
  }

  r.setProperty('--ink', t.ink);
  r.setProperty('--bg2', t.bg2);
  r.setProperty('--cream', t.text);
  r.setProperty('--muted', t.muted);
  r.setProperty('--accent', t.accent);
  r.setProperty('--olive', t.olive);
  r.setProperty('--line', t.line);
}

async function loadMenu() {
  const [cats, items, settings] = await Promise.all([
    sb.from('categories').select('*').order('sort_order'),
    sb.from('menu_items').select('*').order('sort_order'),
    sb.from('settings').select('*').eq('id', 1).maybeSingle()
  ]);
  if (cats.error) throw cats.error;
  if (items.error) throw items.error;
  return {
    cats: (cats.data || []).filter((c) => c.is_visible),
    allCats: cats.data || [],
    items: items.data || [],
    settings: settings.data || { shop_name: 'Τρύφων', page_seconds: 12, theme: 'taverna', font: 'classic', bg_url: null, bg_dim: 70 }
  };
}

/* Ζωντανή ενημέρωση: realtime + ασφαλιστικό polling */
function watchMenu(onChange, pollMs = 60000) {
  sb.channel('menu-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, onChange)
    .subscribe();
  setInterval(onChange, pollMs);
}

/* Τοπικό αντίγραφο: αν πέσει το ίντερνετ, η οθόνη δεν αδειάζει */
const cache = {
  save(data) {
    try { localStorage.setItem('tryfon-menu', JSON.stringify(data)); } catch (e) {}
  },
  load() {
    try { return JSON.parse(localStorage.getItem('tryfon-menu') || 'null'); } catch (e) { return null; }
  }
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Ανέβασμα φόντου ---------- */
/* Σμικρύνει την εικόνα πριν το ανέβασμα: μια φωτογραφία κινητού 6 MB
   δεν έχει νόημα να ταξιδεύει ολόκληρη σε μια τηλεόραση 1080p. */
function shrinkImage(file, maxW = 1920, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/jpeg', quality);
    };
    img.onerror = () => reject(new Error('Δεν διαβάστηκε η εικόνα'));
    img.src = URL.createObjectURL(file);
  });
}

async function uploadBackground(file) {
  if (!file.type.startsWith('image/')) throw new Error('Επίλεξε αρχείο εικόνας');
  const blob = await shrinkImage(file);
  const path = 'bg-' + Math.random().toString(36).slice(2, 10) + '.jpg';
  const up = await sb.storage.from('branding')
    .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (up.error) throw up.error;
  return sb.storage.from('branding').getPublicUrl(path).data.publicUrl;
}
