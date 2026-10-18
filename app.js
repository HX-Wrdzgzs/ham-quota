"use strict";

// HAM语录 frontend. No third-party dependencies; metadata and vote totals
// come from the server. Callsigns are client-entered, not verified identities.
const state = {
  page: 1, limit: 24, source: "", category: "", sort: "default",
  search: "", categories: [], current: null, pendingAfterIdentity: null,
  callsign: localStorage.getItem("ham_callsign") || "",
  favorites: new Set(JSON.parse(localStorage.getItem("ham_favorites") || "[]")),
  requestSerial: 0,
};
const $ = id => document.getElementById(id);
let toastTimer, searchTimer;

async function request(url, options) {
  const response = await fetch(url, options);
  let json;
  try { json = await response.json(); } catch { throw new Error("服务器返回了无法识别的结果"); }
  if (!response.ok) throw new Error(json.error || "请求失败");
  return json;
}
function post(url, data) {
  return request(url, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(data) });
}
function toast(message, isError=false) {
  const box = $("toast");
  box.textContent = message;
  box.style.background = isError ? "#7d3f37" : "#373c36";
  box.style.color = "#fff";
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("show"), 3300);
}
function showDialog(id) {
  const el=$(id);
  if (!el.open) el.showModal();
}
function closeDialog(id) {
  const el=$(id);
  if (el.open) el.close();
}
function el(tag, classes, txt) {
  const x=document.createElement(tag);
  if (classes) x.className=classes;
  if (txt !== undefined) x.textContent=txt;
  return x;
}
function savedFavorites() {
  localStorage.setItem("ham_favorites",JSON.stringify([...state.favorites]));
}
function updateIdentityButton() {
  $("identityBtn").textContent = state.callsign ? "呼号 · "+state.callsign : "设定呼号";
}
function ensureIdentity(next) {
  if (state.callsign) { next(); return; }
  state.pendingAfterIdentity=next;
  $("callsignInput").value="";
  $("identityError").textContent="";
  showDialog("identityDialog");
  $("callsignInput").focus();
}
function updateStats() {
  return request("/api/stats").then(stats => {
    $("statImages").textContent=stats.images;
  }).catch(e=>toast("统计读取失败："+e.message,true));
}
async function updateCategories() {
  try {
    const response=await request("/api/categories");
    state.categories=response.categories;
    const area=$("categoryChips");
    area.replaceChildren();
    const choices=[{value:"",label:"全部"},{value:"unclassified",label:"待分类"},{value:"favorites",label:"收藏"}]
      .concat(state.categories.map(x=>({value:String(x.id),label:x.label})));
    choices.forEach(cat=>{
      const btn=el("button","chip"+(state.category===cat.value?" active":""),cat.label);
      btn.type="button";
      btn.dataset.category=cat.value;
      btn.addEventListener("click",()=>{
        state.category=cat.value;
        state.page=1;
        updateCategoriesVisual();
        loadQuotes();
      });
      area.appendChild(btn);
    });
    const select=$("classificationSelect");
    select.replaceChildren();
    state.categories.forEach(cat=>{
      const opt=document.createElement("option");
      opt.value=String(cat.id); opt.textContent=cat.label;
      select.appendChild(opt);
    });
  } catch(e) { toast("分类加载失败："+e.message,true); }
}
function updateCategoriesVisual() {
  document.querySelectorAll("#categoryChips .chip").forEach(btn=>
    btn.classList.toggle("active",btn.dataset.category===state.category));
}
function skeleton() {
  const grid=$("gallery");grid.replaceChildren();
  for(let i=0;i<8;i++) grid.appendChild(el("div","skeleton"));
}
function renderCard(item) {
  const card=el("article","quote-card");
  const photo=el("button","card-photo");
  photo.type="button";
  photo.setAttribute("aria-label","查看语录 "+item.filename);
  const img=document.createElement("img");
  img.loading="eager";
  img.decoding="async";
  img.alt=item.source+"来源的语录截图";
  img.addEventListener("load",()=>{img.dataset.state=img.naturalWidth>0?"loaded":"invalid";});
  img.addEventListener("error",()=>{
    img.dataset.state="error";
    img.hidden=true;
    photo.appendChild(el("span","image-error","图片加载失败"));
  });
  img.src=item.image;
  photo.appendChild(img);
  photo.addEventListener("click",()=>openDetail(item.id));
  const meta=el("div","quote-meta");
  meta.appendChild(el("span","quote-category"+(item.votes===0?" unclassified":""),item.category));
  meta.appendChild(el("span","quote-source",item.source));
  card.append(photo,meta);
  return card;
}
function pagination(total) {
  const box=$("pagination");box.replaceChildren();
  const pages=Math.ceil(total/state.limit);
  if(pages<=1) return;
  const previous=el("button","","← 上一页");previous.type="button";previous.disabled=state.page<=1;
  const next=el("button","","下一页 →");next.type="button";next.disabled=state.page>=pages;
  const info=el("span","",String(state.page).padStart(2,"0")+" / "+String(pages).padStart(2,"0"));
  previous.addEventListener("click",()=>setPage(state.page-1));
  next.addEventListener("click",()=>setPage(state.page+1));
  box.append(previous,info,next);
}
function setPage(page) {
  state.page=page;
  loadQuotes();
  $("archive").scrollIntoView({behavior:"smooth",block:"start"});
}
async function loadFavoriteQuotes(){
  let ids=[...state.favorites];
  const source=state.source, search=state.search.toLowerCase();
  const all=await Promise.all(ids.map(id=>request("/api/quotes/"+encodeURIComponent(id))
                      .then(x=>x.item).catch(()=>null)));
  let filtered=all.filter(Boolean).filter(x=>(!source||x.source===source)&&
                   (!search||x.filename.toLowerCase().includes(search)||x.id.includes(search)));
  if(state.sort==="popular") filtered.sort((a,b)=>b.votes-a.votes);
  else if(state.sort==="least") filtered.sort((a,b)=>a.votes-b.votes);
  else if(state.sort==="random") filtered.sort(()=>Math.random()-.5);
  else filtered.sort((a,b)=>a.filename.localeCompare(b.filename));
  const start=(state.page-1)*state.limit;
  return {items:filtered.slice(start,start+state.limit),total:filtered.length,page:state.page};
}
async function loadQuotes() {
  const serial=++state.requestSerial;
  skeleton(); $("emptyState").classList.add("hidden"); $("pagination").replaceChildren();
  try{
    let data;
    if(state.category==="favorites") data=await loadFavoriteQuotes();
    else {
      const params=new URLSearchParams({page:state.page,limit:state.limit,sort:state.sort});
      if(state.source) params.set("source",state.source);
      if(state.category) params.set("category",state.category);
      if(state.search) params.set("search",state.search);
      data=await request("/api/quotes?"+params);
    }
    if(serial!==state.requestSerial) return;
    const grid=$("gallery");grid.replaceChildren();
    data.items.forEach(item=>grid.appendChild(renderCard(item)));
    $("resultCount").textContent="共 "+data.total+" 张";
    if(!data.items.length){$("emptyState").classList.remove("hidden");}
    pagination(data.total);
  }catch(e){
    if(serial!==state.requestSerial)return;
    $("gallery").replaceChildren();
    $("resultCount").textContent="加载失败";
    toast("读取档案失败："+e.message,true);
  }
}
function renderBreakdown(item){
  const box=$("voteBreakdown");box.replaceChildren();
  item.breakdown.forEach(x=>{
    const row=el("div","vote-entry");
    row.appendChild(el("span","",x.label));
    const bar=el("div","vote-bar");const inner=document.createElement("span");
    inner.style.width=(item.votes?x.count/item.votes*100:0)+"%";
    bar.appendChild(inner);row.appendChild(bar);
    row.appendChild(el("small","",String(x.count)));
    box.appendChild(row);
  });
  if(!item.breakdown.length)box.appendChild(el("p","","还没有人分类。成为第一个参与者吧。"));
}
async function openDetail(id){
  try {
    const response=await request("/api/quotes/"+encodeURIComponent(id));
    state.current=response.item;
    renderDetail();
    showDialog("detailDialog");
  }catch(e){toast(e.message,true);}
}
function renderDetail(){
  const item=state.current;if(!item)return;
  $("detailSerial").textContent="图片编号 "+item.id.slice(0,8).toUpperCase();
  $("detailImage").src=item.image;
  $("detailTitle").textContent=item.filename;
  $("detailSource").textContent="来自 "+item.source;
  $("detailVotes").textContent=item.votes+" 人参与分类";
  $("detailCategory").textContent=item.category;
  $("favoriteBtn").textContent=state.favorites.has(item.id)?"已收藏":"收藏";
  renderBreakdown(item);
}
function toggleFavorite(id){
  if(state.favorites.has(id)){state.favorites.delete(id);toast("已取消收藏");}
  else{state.favorites.add(id);toast("已收藏到此浏览器");}
  savedFavorites();
  if(state.current&&state.current.id===id)$("favoriteBtn").textContent=state.favorites.has(id)?"已收藏":"收藏";
}
async function randomQuote(){
  try{
    const params=new URLSearchParams();
    if(state.source)params.set("source",state.source);
    const result=await request("/api/random?"+params);
    if(!result.item){toast("当前没有语录",true);return;}
    state.current=result.item;
    renderDetail();
    showDialog("detailDialog");
  }catch(e){toast(e.message,true);}
}
function beginClassification(){
  if(!state.current)return;
  ensureIdentity(()=>{
    $("classifyBy").textContent=state.callsign;
    $("classifyError").textContent="";
    const desired=state.current.category_id;
    if(desired) $("classificationSelect").value=String(desired);
    showDialog("classifyDialog");
  });
}
function beginNewCategory(){
  ensureIdentity(()=>{
    $("categoryNameInput").value="";
    $("newCategoryError").textContent="";
    showDialog("newCategoryDialog");
  });
}
function beginReport(){
  if(!state.current)return;
  ensureIdentity(()=>{
    $("reportReason").value="";
    $("reportError").textContent="";
    showDialog("reportDialog");
  });
}
async function shareCurrent(){
  if(!state.current)return;
  const url=new URL(window.location.href);
  url.hash="quote/"+state.current.id;
  try {
    if(navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(url.href);
    }else{
      const field=document.createElement("textarea");
      field.value=url.href;
      field.setAttribute("readonly","");
      field.style.position="fixed";
      field.style.opacity="0";
      document.body.appendChild(field);
      field.focus();
      field.select();
      const copied=document.execCommand("copy");
      field.remove();
      if(!copied)throw new Error("复制失败");
    }
    toast("已复制分享链接");
  }catch(err){
    toast("复制受浏览器限制，请在地址栏复制链接",true);
  }
}
function resetFilters(){
  state.page=1;state.category="";state.source="";state.search="";state.sort="default";
  $("searchInput").value="";$("sourceFilter").value="";$("sortFilter").value="default";
  updateCategoriesVisual();loadQuotes();
}
function bindEvents(){
  document.querySelectorAll("[data-close]").forEach(btn=>
    btn.addEventListener("click",()=>closeDialog(btn.dataset.close)));
  document.querySelectorAll("dialog").forEach(dialog=>
    dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close();}));
  $("identityBtn").addEventListener("click",()=>{
    state.pendingAfterIdentity=null;
    $("callsignInput").value=state.callsign;
    $("identityError").textContent="";
    showDialog("identityDialog");
  });
  $("identityForm").addEventListener("submit",e=>{
    e.preventDefault();
    const input=$("callsignInput").value.trim().toUpperCase();
    if(!/^[A-Z0-9][A-Z0-9/-]{2,15}$/.test(input)||!/[A-Z]/.test(input)||!/[0-9]/.test(input)){
      $("identityError").textContent="呼号须为3–16位字母数字（可包含 / 或 -），至少各有一个字母和数字。";return;
    }
    state.callsign=input;
    localStorage.setItem("ham_callsign",input);
    updateIdentityButton();
    closeDialog("identityDialog");
    toast("已使用呼号 "+input+" 署名");
    const next=state.pendingAfterIdentity;state.pendingAfterIdentity=null;
    if(next)next();
  });
  $("classifyForm").addEventListener("submit",async e=>{
    e.preventDefault();
    if(!state.current)return;
    const btn=$("classifyForm").querySelector('[type="submit"]');
    btn.disabled=true;$("classifyError").textContent="";
    try{
      const res=await post("/api/classify",{
        callsign:state.callsign,quote_id:state.current.id,
        category_id:Number($("classificationSelect").value)
      });
      state.current=res.item;
      renderDetail();
      closeDialog("classifyDialog");
      toast("已更新分类");
      await Promise.all([loadQuotes(),updateStats(),updateCategories()]);
    }catch(err){$("classifyError").textContent=err.message;}
    finally{btn.disabled=false;}
  });
  $("newCategoryForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const btn=$("newCategoryForm").querySelector('[type="submit"]');
    btn.disabled=true;$("newCategoryError").textContent="";
    try{
      const res=await post("/api/categories",{callsign:state.callsign,label:$("categoryNameInput").value.trim()});
      closeDialog("newCategoryDialog");
      await updateCategories();
      toast(res.existing?"分类已存在，可以直接使用":"已创建新分类");
      if(state.current){$("classifyBy").textContent=state.callsign;$("classificationSelect").value=String(res.id);showDialog("classifyDialog");}
    }catch(err){$("newCategoryError").textContent=err.message;}
    finally{btn.disabled=false;}
  });
  $("reportForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const btn=$("reportForm").querySelector('[type="submit"]');
    btn.disabled=true;$("reportError").textContent="";
    try{
      await post("/api/report",{callsign:state.callsign,quote_id:state.current.id,reason:$("reportReason").value.trim()});
      closeDialog("reportDialog");toast("反馈已保存，等待管理员查看");
    }catch(err){$("reportError").textContent=err.message;}
    finally{btn.disabled=false;}
  });
  $("randomTopBtn").addEventListener("click",randomQuote);
  $("sourceFilter").addEventListener("change",e=>{state.source=e.target.value;state.page=1;loadQuotes();});
  $("sortFilter").addEventListener("change",e=>{state.sort=e.target.value;state.page=1;loadQuotes();});
  $("searchInput").addEventListener("input",e=>{
    clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>{state.search=e.target.value.trim();state.page=1;loadQuotes();},280);
  });
  $("resetBtn").addEventListener("click",resetFilters);
  $("addCategoryBtn").addEventListener("click",beginNewCategory);
  $("classifyBtn").addEventListener("click",beginClassification);
  $("favoriteBtn").addEventListener("click",()=>{
    if(state.current){toggleFavorite(state.current.id);if(state.category==="favorites")loadQuotes();}
  });
  $("shareBtn").addEventListener("click",shareCurrent);
  $("reportBtn").addEventListener("click",beginReport);
  window.addEventListener("hashchange",checkSharedQuote);
}
let lastShared="";
function checkSharedQuote(){
  const hash=window.location.hash;
  const id=hash.startsWith('#quote/') ? hash.slice(7) : '';
  const match=/^[0-9a-f]{20}$/.test(id) ? [hash,id] : null;
  if(match&&match[1]!==lastShared){lastShared=match[1];openDetail(match[1]);}
}
async function main(){
  updateIdentityButton();
  bindEvents();
  await Promise.all([updateCategories(),updateStats()]);
  loadQuotes();
  checkSharedQuote();
}
main();