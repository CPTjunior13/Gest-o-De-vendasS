'use strict';
/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
const int = v => Math.max(0, Math.floor(num(v)));
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MES3 = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const DIA3 = ['dom','seg','ter','qua','qui','sex','sáb'];
const D0 = d => { d = new Date(d); d.setHours(0,0,0,0); return d; };
const WK0 = d => { d = D0(d); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const MO0 = d => { d = D0(d); d.setDate(1); return d; };
const todayStr = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const profit = s => (s.price - s.cost) * s.qty;
const rev = s => s.price * s.qty;
const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);

/* ---------- banco (IndexedDB) ---------- */
let db;
const store = (s, m = 'readonly') => db.transaction(s, m).objectStore(s);
const req = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const dbAll = s => req(store(s).getAll());
const dbPut = (s, v) => req(store(s, 'readwrite').put(v));
const dbDel = (s, k) => req(store(s, 'readwrite').delete(k));
const dbClear = s => req(store(s, 'readwrite').clear());
function openDB() {
  return new Promise((ok, no) => {
    const r = indexedDB.open('glow-vendas', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('products', { keyPath: 'id' });
      d.createObjectStore('sales', { keyPath: 'id' });
      d.createObjectStore('meta', { keyPath: 'k' });
    };
    r.onsuccess = () => { db = r.result; ok(); };
    r.onerror = () => no(r.error);
  });
}
const S = { products: [], sales: [], goal: 0 };
async function load() {
  S.products = await dbAll('products');
  S.sales = await dbAll('sales');
  const g = (await dbAll('meta')).find(m => m.k === 'goal');
  S.goal = g ? g.v : 0;
}

/* ---------- toast / modal ---------- */
let toastTimer;
function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button id="t-undo">Desfazer</button>' : ''}`;
  t.hidden = false;
  if (undo) $('#t-undo').onclick = () => { undo(); t.hidden = true; };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.hidden = true, 4500);
}
function openModal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet">${html}</div>`;
  m.hidden = false;
  m.onclick = e => { if (e.target === m) closeModal(); };
}
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }

/* ---------- ações ---------- */
async function sell(pid, o = {}) {
  const p = S.products.find(x => x.id === pid);
  if (!p) return false;
  const qty = o.qty ?? 1;
  if (qty < 1) { toast('Informe a quantidade'); return false; }
  if (qty > p.stock) { toast(`Estoque insuficiente (${p.stock} un.)`); return false; }
  const s = { id: uid(), pid, name: p.name, qty, cost: p.cost, price: o.price ?? p.price, ts: o.ts ?? Date.now(), client: o.client || '', pay: o.pay || '' };
  p.stock -= qty;
  S.sales.push(s);
  await dbPut('sales', s); await dbPut('products', p);
  renderAll();
  toast(`${p.name}: lucro de ${brl(profit(s))}`, () => undoSale(s.id));
  return true;
}
async function undoSale(id) {
  const s = S.sales.find(x => x.id === id);
  if (!s) return;
  const p = S.products.find(x => x.id === s.pid);
  if (p) { p.stock += s.qty; await dbPut('products', p); }
  S.sales = S.sales.filter(x => x.id !== id);
  await dbDel('sales', id);
  renderAll();
}
async function addStock(pid, n) {
  const p = S.products.find(x => x.id === pid);
  if (!p || n < 1) return;
  p.stock += n;
  await dbPut('products', p);
  renderAll();
  toast(`${p.name}: estoque ${p.stock}`, async () => { p.stock -= n; await dbPut('products', p); renderAll(); });
}

async function removeStock(pid, n) {
  const p = S.products.find(x => x.id === pid);
  if (!p || n < 1) return false;
  if (n > p.stock) { toast(`Estoque insuficiente (${p.stock} un.)`); return false; }
  p.stock -= n;
  await dbPut('products', p);
  renderAll();
  toast(`${p.name}: estoque ${p.stock}`, async () => { p.stock += n; await dbPut('products', p); renderAll(); });
  return true;
}

/* ---------- fotos ---------- */
function compress(file, max = 640) {
  return new Promise((ok, no) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', .78));
    };
    img.onerror = no;
    img.src = url;
  });
}
const cover = p => p.photos && p.photos[0] ? `style="background-image:url('${p.photos[0]}')"` : '';
const initial = p => p.photos && p.photos[0] ? '' : esc((p.name || '?').trim().charAt(0).toUpperCase());

/* ---------- cadastro de produto ---------- */
function productForm(id) {
  const old = S.products.find(x => x.id === id);
  const p = old || { name: '', photos: [], cost: '', price: '', stock: 0, min: 2, cat: '' };
  let photos = [...p.photos];
  const cats = [...new Set(S.products.map(x => x.cat).filter(Boolean))];
  openModal(`<h2>${old ? 'Editar produto' : 'Novo produto'}</h2>
    <label>Nome<input id="f-name" value="${esc(p.name)}" placeholder="Ex.: Hidratante corporal 200 ml"></label>
    <div class="lbl">Fotos (até 4)</div>
    <div id="f-photos" class="thumbs"></div>
    <input id="f-file" type="file" accept="image/*" multiple hidden>
    <label>Categoria<input id="f-cat" list="cats" value="${esc(p.cat)}" placeholder="Perfume, batom, skincare…"><datalist id="cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <div class="row2">
      <label>Quanto gastei (custo)<input id="f-cost" inputmode="decimal" value="${p.cost}" placeholder="0,00"></label>
      <label>Vou vender por<input id="f-price" inputmode="decimal" value="${p.price}" placeholder="0,00"></label>
    </div>
    <div id="f-calc" class="calc"></div>
    <div class="row2">
      <label>${old ? 'Estoque atual' : 'Estoque inicial'}<input id="f-stock" inputmode="numeric" value="${p.stock}"></label>
      <label>Avisar estoque baixo em<input id="f-min" inputmode="numeric" value="${p.min}"></label>
    </div>
    <div class="actions">
      ${old ? '<button class="btn danger" id="f-del">Excluir</button>' : ''}
      <button class="btn ghost" id="f-cancel">Cancelar</button>
      <button class="btn" id="f-save">Salvar</button>
    </div>`);
  const drawPhotos = () => {
    $('#f-photos').innerHTML = photos.map((src, i) => `<div class="th" style="background-image:url('${src}')"><button data-rm="${i}" aria-label="Remover foto">×</button></div>`).join('') +
      (photos.length < 4 ? '<button class="add-ph" id="f-add">Adicionar foto</button>' : '');
    $$('[data-rm]').forEach(b => b.onclick = () => { photos.splice(+b.dataset.rm, 1); drawPhotos(); });
    const add = $('#f-add'); if (add) add.onclick = () => $('#f-file').click();
  };
  const calc = () => {
    const c = num($('#f-cost').value), v = num($('#f-price').value), l = v - c;
    $('#f-calc').innerHTML = v > 0 ? `Lucro por unidade: <b class="${l >= 0 ? 'pos' : 'neg'}">${brl(l)}</b> · margem de <b>${(l / v * 100).toFixed(0)}%</b>` : 'Informe custo e preço para ver o lucro por unidade.';
  };
  drawPhotos(); calc();
  $('#f-cost').oninput = calc; $('#f-price').oninput = calc;
  $('#f-file').onchange = async e => {
    for (const f of [...e.target.files]) { if (photos.length >= 4) break; try { photos.push(await compress(f)); } catch {} }
    e.target.value = ''; drawPhotos();
  };
  $('#f-cancel').onclick = closeModal;
  if (old) $('#f-del').onclick = async () => {
    if (!confirm('Excluir este produto? O histórico de vendas dele continua salvo.')) return;
    S.products = S.products.filter(x => x.id !== id); await dbDel('products', id); closeModal(); renderAll();
  };
  $('#f-save').onclick = async () => {
    const name = $('#f-name').value.trim();
    if (!name) { toast('Digite o nome do produto'); return; }
    const np = { id: old ? old.id : uid(), name, photos, cat: $('#f-cat').value.trim(), cost: num($('#f-cost').value), price: num($('#f-price').value), stock: int($('#f-stock').value), min: int($('#f-min').value), created: old ? old.created : Date.now() };
    if (old) Object.assign(old, np); else S.products.push(np);
    await dbPut('products', np);
    closeModal(); renderAll(); toast('Produto salvo');
  };
}

/* ---------- venda detalhada / entrada de estoque ---------- */
function moreForm(id) {
  const p = S.products.find(x => x.id === id); if (!p) return;
  openModal(`<h2>${esc(p.name)}</h2>
    <p class="mute" style="margin-top:-4px">Estoque atual: <b>${p.stock}</b></p>
    <h3>Registrar venda</h3>
    <div class="row2">
      <label>Quantidade<input id="m-q" inputmode="numeric" value="1"></label>
      <label>Preço unitário<input id="m-p" inputmode="decimal" value="${p.price}"></label>
    </div>
    <div class="row2">
      <label>Cliente (opcional)<input id="m-c"></label>
      <label>Pagamento<select id="m-pay"><option>Pix</option><option>Dinheiro</option><option>Cartão</option><option>Outro</option></select></label>
    </div>
    <label>Data da venda<input id="m-d" type="date" value="${todayStr()}"></label>
    <button class="btn full" id="m-sell">Registrar venda</button>
    <h3>Entrada de estoque</h3>
    <div class="row2"><label>Quantidade<input id="m-sq" inputmode="numeric" value="1"></label><button class="btn ghost" id="m-add" style="align-self:center;margin-top:8px">Adicionar</button></div>
    <h3>Saída de estoque (sem venda)</h3>
    <p class="small" style="margin-top:-4px">Use para corrigir erro de contagem, perda, brinde ou produto vencido. Não entra no lucro.</p>
    <div class="row2"><label>Quantidade<input id="m-rq" inputmode="numeric" value="1"></label><button class="btn danger" id="m-rem" style="align-self:center;margin-top:8px">Remover</button></div>
    <button class="btn ghost full" id="m-edit" style="margin-top:12px">Editar produto</button>`);
  $('#m-sell').onclick = async () => {
    const d = $('#m-d').value;
    const ts = !d || d === todayStr() ? Date.now() : new Date(d + 'T12:00:00').getTime();
    if (await sell(id, { qty: int($('#m-q').value), price: num($('#m-p').value), client: $('#m-c').value.trim(), pay: $('#m-pay').value, ts })) closeModal();
  };
  $('#m-add').onclick = async () => { const n = int($('#m-sq').value); if (n < 1) return toast('Informe a quantidade'); await addStock(id, n); closeModal(); };
  $('#m-rem').onclick = async () => { if (await removeStock(id, int($('#m-rq').value))) closeModal(); };
  $('#m-edit').onclick = () => productForm(id);
}

/* ---------- ajustes / backup ---------- */
let deferredInstall;
function settingsForm() {
  openModal(`<h2>Ajustes</h2>
    <label>Meta de lucro mensal (opcional)<input id="s-goal" inputmode="decimal" value="${S.goal || ''}" placeholder="Ex.: 1500"></label>
    <button class="btn full" id="s-save">Salvar meta</button>
    <h3>Backup</h3>
    <p class="small">Seus dados ficam guardados só neste aparelho. Faça um backup de vez em quando, principalmente antes de trocar de celular ou limpar o navegador.</p>
    <div class="actions"><button class="btn ghost" id="s-exp">Exportar backup</button><button class="btn ghost" id="s-imp">Importar backup</button></div>
    <input id="s-file" type="file" accept="application/json,.json" hidden>
    <button class="btn danger full" id="s-wipe" style="margin-top:12px">Apagar todos os dados</button>`);
  $('#s-save').onclick = async () => { S.goal = num($('#s-goal').value); await dbPut('meta', { k: 'goal', v: S.goal }); closeModal(); renderAll(); toast('Meta salva'); };
  $('#s-exp').onclick = async () => {
    const json = JSON.stringify({ v: 1, products: S.products, sales: S.sales, goal: S.goal });
    const name = `glow-backup-${todayStr()}.json`;
    try {
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Backup Glow Vendas' }); return; }
    } catch (err) { if (err && err.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('#s-imp').onclick = () => $('#s-file').click();
  $('#s-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d.products) || !Array.isArray(d.sales)) throw 0;
      if (!confirm('Importar este backup? Os dados atuais serão substituídos.')) return;
      await dbClear('products'); await dbClear('sales');
      for (const p of d.products) await dbPut('products', p);
      for (const s of d.sales) await dbPut('sales', s);
      await dbPut('meta', { k: 'goal', v: d.goal || 0 });
      await load(); closeModal(); renderAll(); toast('Backup importado');
    } catch { toast('Arquivo de backup inválido'); }
  };
  $('#s-wipe').onclick = async () => {
    if (!confirm('Apagar produtos e vendas deste aparelho? Isso não pode ser desfeito.')) return;
    await dbClear('products'); await dbClear('sales'); await dbClear('meta');
    S.products = []; S.sales = []; S.goal = 0; closeModal(); renderAll();
  };
}

/* ---------- telas ---------- */
function renderHome() {
  const now = new Date();
  const m0 = MO0(now).getTime(), pm0 = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), d0 = D0(now).getTime();
  const inM = S.sales.filter(s => s.ts >= m0), inPM = S.sales.filter(s => s.ts >= pm0 && s.ts < m0), today = S.sales.filter(s => s.ts >= d0);
  const lm = sum(inM, profit), lpm = sum(inPM, profit);
  let delta = 'Ainda sem lucro no mês passado para comparar';
  if (lpm > 0) { const d = (lm - lpm) / lpm * 100; delta = `${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(0)}% em relação ao mês passado (${brl(lpm)})`; }
  const goal = S.goal > 0
    ? `<div class="bar"><i style="width:${Math.min(100, lm / S.goal * 100)}%"></i></div><div class="hs">${Math.round(lm / S.goal * 100)}% da meta de ${brl(S.goal)}</div>`
    : '<button class="link" data-a="settings">Definir meta mensal</button>';
  if (!S.products.length) {
    $('#t-home').innerHTML = `<div class="hero"><div class="hl">Lucro de ${MESES[now.getMonth()]}</div><div class="hv">${brl(0)}</div><div class="hs">Cadastre seus produtos para começar a vender.</div></div>
      <div class="empty">Nenhum produto cadastrado ainda.<br><button class="btn" data-a="goto" data-v="prod">Cadastrar o primeiro produto</button></div>`;
    return;
  }
  const byP = {};
  inM.forEach(s => { const k = s.pid; (byP[k] ||= { name: s.name, qty: 0, lucro: 0 }); byP[k].qty += s.qty; byP[k].lucro += profit(s); });
  const top = Object.values(byP).sort((a, b) => b.qty - a.qty).slice(0, 5);
  const low = S.products.filter(p => p.stock <= p.min).sort((a, b) => a.stock - b.stock);
  const invest = sum(S.products, p => p.cost * p.stock), pot = sum(S.products, p => p.price * p.stock);
  const stat = (l, v) => `<div class="stat"><span>${l}</span><b>${v}</b></div>`;
  $('#t-home').innerHTML = `
    <div class="hero"><div class="hl">Lucro de ${MESES[now.getMonth()]}</div><div class="hv">${brl(lm)}</div><div class="hs">${delta}</div>${goal}</div>
    <div class="grid">
      ${stat('Lucro de hoje', brl(sum(today, profit)))}
      ${stat('Faturamento do mês', brl(sum(inM, rev)))}
      ${stat('Itens vendidos no mês', sum(inM, s => s.qty))}
      ${stat('Ticket médio', brl(inM.length ? sum(inM, rev) / inM.length : 0))}
    </div>
    <div class="card"><h3>Estoque parado</h3>
      <div class="kv"><span>Investido nos produtos em estoque</span><b>${brl(invest)}</b></div>
      <div class="kv"><span>Valor de venda do estoque</span><b>${brl(pot)}</b></div>
      <div class="kv"><span>Lucro previsto se vender tudo</span><b class="pos">${brl(pot - invest)}</b></div>
    </div>
    ${low.length ? `<div class="card"><h3>Hora de repor</h3>${low.slice(0, 6).map(p => `<div class="rank"><div class="n">${esc(p.name)}</div><span class="tag ${p.stock < 1 ? 'out' : 'low'}">${p.stock < 1 ? 'Esgotado' : p.stock + ' un.'}</span></div>`).join('')}<button class="btn ghost full" style="margin-top:10px" data-a="goto" data-v="sell">Ir para vendas</button></div>` : ''}
    ${top.length ? `<div class="card"><h3>Mais vendidos do mês</h3>${top.map(t => `<div class="rank"><div class="n">${esc(t.name)}</div><small>${t.qty} un.</small><b class="pos">${brl(t.lucro)}</b></div>`).join('')}</div>` : ''}
    <div class="card"><div class="kv"><span>Lucro total acumulado</span><b>${brl(sum(S.sales, profit))}</b></div></div>`;
}

function renderSell() {
  const q = ($('#q').value || '').toLowerCase().trim();
  const list = S.products.filter(p => !q || (p.name + ' ' + (p.cat || '')).toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  if (!list.length) {
    $('#sell-list').innerHTML = S.products.length ? '<div class="empty">Nenhum produto encontrado.</div>' : '<div class="empty">Cadastre produtos para vender.<br><button class="btn" data-a="goto" data-v="prod">Cadastrar produto</button></div>';
    return;
  }
  $('#sell-list').innerHTML = list.map(p => {
    const t = p.stock < 1 ? '<span class="tag out">Esgotado</span>' : p.stock <= p.min ? `<span class="tag low">${p.stock} em estoque</span>` : `<span class="tag">${p.stock} em estoque</span>`;
    return `<div class="item" data-id="${p.id}">
      <div class="top"><div class="ph" ${cover(p)}>${initial(p)}</div>
        <div class="info"><b>${esc(p.name)}</b><small>${brl(p.price)} · lucro ${brl(p.price - p.cost)}</small><div style="margin-top:4px">${t}</div></div>
        <button class="dots" data-a="more" aria-label="Mais opções">⋯</button></div>
      <div class="acts"><button class="btn ghost" data-a="unstock" ${p.stock < 1 ? 'disabled' : ''}>−1 estoque</button><button class="btn ghost" data-a="stock">+1 estoque</button><button class="btn sold" data-a="sell" ${p.stock < 1 ? 'disabled' : ''}>Vendido</button></div>
    </div>`;
  }).join('');
}

function renderProducts() {
  const list = [...S.products].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  $('#prod-list').innerHTML = list.length ? list.map(p => {
    const l = p.price - p.cost, m = p.price > 0 ? Math.round(l / p.price * 100) : 0;
    return `<div class="item prod" data-id="${p.id}" data-a="edit" style="margin-top:10px"><div class="top"><div class="ph" ${cover(p)}>${initial(p)}</div>
      <div class="info"><b>${esc(p.name)}</b><small>${p.cat ? esc(p.cat) + ' · ' : ''}custo ${brl(p.cost)} → venda ${brl(p.price)}</small>
      <small>Lucro ${brl(l)} (${m}%) · estoque ${p.stock}</small></div></div></div>`;
  }).join('') : '<div class="empty">Seus produtos vão aparecer aqui.</div>';
}

/* ---------- gráficos ---------- */
const ch = { per: 'd', met: 'profit' };
function buckets() {
  const now = new Date(), out = [];
  if (ch.per === 'd') for (let i = 13; i >= 0; i--) { const d = D0(now); d.setDate(d.getDate() - i); out.push({ t: d.getTime(), end: d.getTime() + 864e5, l1: String(d.getDate()), l2: DIA3[d.getDay()], cur: i === 0 }); }
  else if (ch.per === 'w') for (let i = 7; i >= 0; i--) { const d = WK0(now); d.setDate(d.getDate() - 7 * i); const e = new Date(d); e.setDate(e.getDate() + 7); out.push({ t: d.getTime(), end: e.getTime(), l1: `${d.getDate()}/${d.getMonth() + 1}`, l2: '', cur: i === 0 }); }
  else for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1), e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1); out.push({ t: d.getTime(), end: e.getTime(), l1: MES3[d.getMonth()], l2: d.getMonth() === 0 || i === 11 ? String(d.getFullYear()) : '', cur: i === 0 }); }
  out.forEach(b => {
    const ss = S.sales.filter(s => s.ts >= b.t && s.ts < b.end);
    b.profit = sum(ss, profit); b.revenue = sum(ss, rev); b.qty = sum(ss, s => s.qty);
  });
  return out;
}
const short = (v, met) => met === 'qty' ? String(v) : v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'k' : String(Math.round(v));
function chartSVG(b, met) {
  const W = 340, H = 200, pl = 6, pr = 6, pt = 20, pb = 36, n = b.length, bw = (W - pl - pr) / n, bar = Math.min(28, bw * .62);
  const max = Math.max(1, ...b.map(x => x[met]));
  let g = `<line x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}" stroke="#f0d9e0"/>`;
  b.forEach((x, i) => {
    const v = x[met], h = Math.max(0, v) / max * (H - pb - pt), cx = pl + bw * i + bw / 2, y = H - pb - h;
    g += `<rect x="${cx - bar / 2}" y="${y}" width="${bar}" height="${v > 0 ? Math.max(h, 2) : 0}" rx="3" class="${x.cur ? 'cur' : ''}"/>`;
    if (v > 0) g += `<text x="${cx}" y="${y - 4}" class="v" text-anchor="middle">${short(v, met)}</text>`;
    g += `<text x="${cx}" y="${H - pb + 13}" class="l" text-anchor="middle">${x.l1}</text>`;
    if (x.l2) g += `<text x="${cx}" y="${H - pb + 24}" class="l2" text-anchor="middle">${x.l2}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de vendas">${g}</svg>`;
}
function renderCharts() {
  const b = buckets(), met = ch.met;
  const cap = { d: 'Últimos 14 dias', w: 'Últimas 8 semanas (segunda a domingo)', m: 'Últimos 12 meses' }[ch.per];
  const tot = k => sum(b, x => x[k]);
  const seg = (a, v, l) => `<button data-a="${a}" data-v="${v}" class="${(a === 'per' ? ch.per : ch.met) === v ? 'on' : ''}">${l}</button>`;
  const hist = [...S.sales].sort((a, z) => z.ts - a.ts).slice(0, 40);
  $('#t-chart').innerHTML = `
    <div class="seg">${seg('per', 'd', 'Diário')}${seg('per', 'w', 'Semanal')}${seg('per', 'm', 'Mensal')}</div>
    <div class="seg">${seg('met', 'profit', 'Lucro')}${seg('met', 'revenue', 'Faturamento')}${seg('met', 'qty', 'Quantidade')}</div>
    <div class="card chart"><small>${cap}</small>${chartSVG(b, met)}</div>
    <div class="grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><span>Lucro</span><b style="font-size:16px">${brl(tot('profit'))}</b></div>
      <div class="stat"><span>Faturado</span><b style="font-size:16px">${brl(tot('revenue'))}</b></div>
      <div class="stat"><span>Itens</span><b style="font-size:16px">${tot('qty')}</b></div>
    </div>
    <div class="card"><h3>Histórico de vendas</h3>${hist.length ? hist.map(s => {
      const d = new Date(s.ts);
      return `<div class="hist" data-id="${s.id}"><div class="info"><b>${esc(s.name)}</b><small>${s.qty} × ${brl(s.price)} · ${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${s.client ? ' · ' + esc(s.client) : ''}${s.pay ? ' · ' + esc(s.pay) : ''}</small></div><b class="${profit(s) >= 0 ? 'pos' : 'neg'}">${brl(profit(s))}</b><button class="undo" data-a="undo-sale">Desfazer</button></div>`;
    }).join('') : '<div class="empty" style="padding:16px">Nenhuma venda registrada.</div>'}</div>`;
}

function renderAll() { renderHome(); renderSell(); renderProducts(); renderCharts(); }
function tab(n) {
  $$('main section').forEach(s => s.hidden = s.id !== 't-' + n);
  $$('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === n));
  window.scrollTo(0, 0);
}

/* ---------- eventos ---------- */
document.addEventListener('click', async e => {
  const nb = e.target.closest('nav button'); if (nb) return tab(nb.dataset.tab);
  const t = e.target.closest('[data-a]'); if (!t) return;
  const a = t.dataset.a, id = t.closest('[data-id]')?.dataset.id;
  if (a === 'sell') await sell(id);
  else if (a === 'stock') await addStock(id, 1);
  else if (a === 'unstock') await removeStock(id, 1);
  else if (a === 'more') moreForm(id);
  else if (a === 'edit') productForm(id);
  else if (a === 'new') productForm();
  else if (a === 'settings') settingsForm();
  else if (a === 'goto') tab(t.dataset.v);
  else if (a === 'per') { ch.per = t.dataset.v; renderCharts(); }
  else if (a === 'met') { ch.met = t.dataset.v; renderCharts(); }
  else if (a === 'undo-sale') { if (confirm('Desfazer esta venda? O item volta ao estoque.')) undoSale(id); }
});
$('#q').addEventListener('input', renderSell);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('#install').hidden = false; });
$('#install').onclick = async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $('#install').hidden = true; };

(async () => {
  try { await openDB(); await load(); } catch (err) { $('#t-home').innerHTML = '<div class="empty">Não foi possível abrir o armazenamento do navegador. Saia do modo anônimo e tente de novo.</div>'; return; }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  renderAll();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
