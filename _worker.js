/* Cloudflare Pages Advanced Mode Worker.
 * Works via dashboard Direct Upload (ZIP) OR Git deployment.
 * Bind a D1 database under variable name DB, initialize with D1初始化.sql.
 * Without DB the image archive works but collaborative writes return 503.
 */
const DEFAULT_CATEGORIES=["经典语录","通联趣事","设备吐槽","名场面","搞笑梗图","其他"];
const CALL=/^[A-Z0-9][A-Z0-9/-]{2,15}$/;
const HEX=/^[0-9a-f]{20}$/;
let MANIFEST=null;
const json=(x,status=200)=>Response.json(x,{status,headers:{
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer","X-Frame-Options":"DENY"
}});
const fail=(msg,status=400)=>json({error:msg},status);
const cleanCall=(v)=>{
  const s=String(v??"").trim().toUpperCase();
  if(!CALL.test(s)||!/[A-Z]/.test(s)||!/[0-9]/.test(s))throw new Error("请填写3–16位有效格式的呼号（包括字母与数字）");
  return s;
};
const cleanLabel=(v)=>{
  const s=String(v??"").trim();
  if(s.length<2||s.length>16||/[<>\\/"'&\x00-\x1f]/.test(s))throw new Error("分类名称须为2–16字，不能包含特殊字符");
  return s;
};
const paramInt=(v,def,min,max)=>{
  const n=Number.parseInt(v??String(def),10);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):def;
};
async function loadManifest(request,env){
  if(MANIFEST)return MANIFEST;
  const url=new URL("/quotes.json",request.url);
  const r=await env.ASSETS.fetch(new Request(url));
  if(!r.ok)throw new Error("图片索引加载失败");
  const content=await r.json();
  MANIFEST=content.quotes;
  return MANIFEST;
}
async function categories(env){
  if(!env.DB)return DEFAULT_CATEGORIES.map((label,i)=>({id:i+1,label,created_by:"SYSTEM",votes:0}));
  const result=await env.DB.prepare(
    "SELECT c.id,c.label,c.created_by,COUNT(v.quote_id) AS votes FROM categories c LEFT JOIN votes v ON c.id=v.category_id GROUP BY c.id ORDER BY votes DESC,c.id ASC"
  ).all();
  return result.results??[];
}
async function voteMap(env){
  const map=new Map();
  if(!env.DB)return map;
  const result=await env.DB.prepare(
    "SELECT v.quote_id AS quote_id,v.category_id AS id,c.label AS label,COUNT(*) AS count FROM votes v JOIN categories c ON v.category_id=c.id GROUP BY v.quote_id,v.category_id ORDER BY count DESC,id ASC"
  ).all();
  for(const rec of result.results??[]){
    if(!map.has(rec.quote_id))map.set(rec.quote_id,[]);
    map.get(rec.quote_id).push({id:rec.id,label:rec.label,count:rec.count});
  }
  return map;
}
function attachVote(rec,voteMap){
  const breakdown=voteMap.get(rec.id)??[];
  const votes=breakdown.reduce((n,x)=>n+x.count,0);
  return {...rec,votes,category:breakdown[0]?.label??"待分类",
    category_id:breakdown[0]?.id??null,breakdown};
}
async function stats(env,manifest){
  if(!env.DB)return {images:manifest.length,classified:0,voters:0,votes:0,
    sources:[{source:"HAM",count:manifest.filter(x=>x.source==="HAM").length},
             {source:"RLL",count:manifest.filter(x=>x.source==="RLL").length}],database_ready:false};
  const r=await env.DB.prepare(
    "SELECT COUNT(DISTINCT quote_id) AS classified,COUNT(DISTINCT callsign) AS voters,COUNT(*) AS votes FROM votes"
  ).first();
  return {images:manifest.length,classified:r?.classified??0,voters:r?.voters??0,votes:r?.votes??0,
    sources:[{source:"HAM",count:manifest.filter(x=>x.source==="HAM").length},
             {source:"RLL",count:manifest.filter(x=>x.source==="RLL").length}],database_ready:true};
}
async function getApi(req,env,path,url,manifest){
  const list=manifest;
  if(path==="/api/health")return json({ok:true,images:list.length,database_ready:!!env.DB});
  if(path==="/api/stats")return json(await stats(env,list));
  if(path==="/api/categories")return json({categories:await categories(env)});
  if(path==="/api/admin/reports"){
    if(!env.ADMIN_TOKEN || req.headers.get("Authorization")!=="Bearer "+env.ADMIN_TOKEN)return fail("未授权",403);
    if(!env.DB)return fail("数据库未绑定",503);
    const r=await env.DB.prepare("SELECT * FROM reports ORDER BY id DESC LIMIT 200").all();
    return json({reports:r.results??[]});
  }
  if(path==="/api/quotes"||path==="/api/random"||path.startsWith("/api/quotes/")){
    const votes=await voteMap(env);
    if(path.startsWith("/api/quotes/")){
      const id=path.split("/").at(-1);
      const rec=list.find(x=>x.id===id);
      if(!rec)return fail("语录不存在",404);
      return json({item:attachVote(rec,votes)});
    }
    let items=list;
    const source=(url.searchParams.get("source")??"").toUpperCase();
    if(source==="HAM"||source==="RLL")items=items.filter(x=>x.source===source);
    if(path==="/api/random"){
      const rec=items[Math.floor(Math.random()*items.length)];
      return json({item:rec?attachVote(rec,votes):null});
    }
    const category=url.searchParams.get("category")??"";
    if(category==="unclassified")items=items.filter(x=>!votes.has(x.id));
    else if(/^\d+$/.test(category))items=items.filter(x=>votes.get(x.id)?.[0]?.id===Number(category));
    const search=(url.searchParams.get("search")??"").trim().toLowerCase().slice(0,100);
    if(search)items=items.filter(x=>x.filename.toLowerCase().includes(search)||x.id.includes(search));
    const sort=url.searchParams.get("sort")??"default";
    if(sort==="random")items=[...items].sort(()=>Math.random()-.5);
    else if(sort==="popular"||sort==="least")items=[...items].sort((a,b)=>{
      const v1=(votes.get(a.id)??[]).reduce((n,x)=>n+x.count,0);
      const v2=(votes.get(b.id)??[]).reduce((n,x)=>n+x.count,0);
      return (sort==="popular"?v2-v1:v1-v2)||a.id.localeCompare(b.id);
    });
    else items=[...items].sort((a,b)=>a.source.localeCompare(b.source)||a.filename.localeCompare(b.filename));
    const page=paramInt(url.searchParams.get("page"),1,1,10000);
    const limit=paramInt(url.searchParams.get("limit"),24,1,60);
    const start=(page-1)*limit;
    return json({total:items.length,page,limit,items:items.slice(start,start+limit).map(x=>attachVote(x,votes))});
  }
  return fail("接口不存在",404);
}
async function postApi(req,env,path,manifest){
  if(!env.DB)return fail("站点尚未绑定 D1 数据库。请管理员完成 Pages 的 DB 绑定和初始化。",503);
  const size=Number(req.headers.get("Content-Length")||0);
  if(size>4096)return fail("请求数据过大",413);
  let obj;
  try { const raw=await req.text(); if(raw.length>4096)return fail("请求数据过大",413);
        obj=JSON.parse(raw); if(typeof obj!=="object"||Array.isArray(obj)||!obj)return fail("参数格式错误"); }
  catch {return fail("JSON 格式错误");}
  let call;
  try {call=cleanCall(obj.callsign);}catch(e){return fail(e.message);}
  if(path==="/api/classify"){
    const id=String(obj.quote_id??"");
    if(!HEX.test(id)||!manifest.some(x=>x.id===id))return fail("语录不存在",404);
    const catId=Number(obj.category_id);
    if(!Number.isInteger(catId))return fail("请选择分类");
    const category=await env.DB.prepare("SELECT id FROM categories WHERE id=?").bind(catId).first();
    if(!category)return fail("分类不存在",404);
    const stamp=new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO votes(quote_id,callsign,category_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(quote_id,callsign) DO UPDATE SET category_id=excluded.category_id,updated_at=excluded.updated_at"
    ).bind(id,call,catId,stamp).run();
    const map=await voteMap(env);
    return json({ok:true,item:attachVote(manifest.find(x=>x.id===id),map),callsign:call});
  }
  if(path==="/api/categories"){
    let label;
    try{label=cleanLabel(obj.label);}catch(e){return fail(e.message);}
    const current=await env.DB.prepare("SELECT id FROM categories WHERE label=? COLLATE NOCASE").bind(label).first();
    if(current)return json({ok:true,id:current.id,existing:true});
    const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM categories").first();
    if((count?.n??0)>=80)return fail("分类数量已达到上限",400);
    try{
      const res=await env.DB.prepare("INSERT INTO categories(label,created_by,created_at) VALUES(?,?,?)").bind(label,call,new Date().toISOString()).run();
      return json({ok:true,id:res.meta.last_row_id,existing:false},201);
    }catch(e){
      const matched=await env.DB.prepare("SELECT id FROM categories WHERE label=? COLLATE NOCASE").bind(label).first();
      if(matched)return json({ok:true,id:matched.id,existing:true});
      throw e;
    }
  }
  if(path==="/api/report"){
    const id=String(obj.quote_id??"");
    const reason=String(obj.reason??"").trim();
    if(!HEX.test(id)||!manifest.some(x=>x.id===id)||reason.length<4||reason.length>200)return fail("请选择语录，填写4–200字的反馈原因");
    await env.DB.prepare("INSERT INTO reports(quote_id,callsign,reason,created_at) VALUES(?,?,?,?)")
      .bind(id,call,reason,new Date().toISOString()).run();
    return json({ok:true},201);
  }
  return fail("接口不存在",404);
}
export default {
  async fetch(request,env,context){
    const url=new URL(request.url);
    if(!url.pathname.startsWith("/api/")){
      return env.ASSETS.fetch(request);
    }
    try{
      const manifest=await loadManifest(request,env);
      if(request.method==="GET")return await getApi(request,env,url.pathname,url,manifest);
      if(request.method==="POST"){
        if(!request.headers.get("content-type")?.startsWith("application/json"))return fail("必须使用 JSON",415);
        return await postApi(request,env,url.pathname,manifest);
      }
      return fail("不支持此请求",405);
    }catch(error){
      console.error("HAM archive API error",error);
      return fail("服务器暂时不可用，请稍后重试",500);
    }
  }
};
