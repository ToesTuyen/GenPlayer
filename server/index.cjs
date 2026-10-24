'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {AppError,TASKS,prepare,complete}=require('./ai.cjs');
const ROOT=path.resolve(__dirname,'..');
function loadEnv(file=path.join(ROOT,'.env')){
  if(!fs.existsSync(file))return;
  for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(!m||process.env[m[1]]!==undefined)continue;
    let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);
    process.env[m[1]]=v;
  }
}
function getConfig(env=process.env){
  const integer=(key,fallback,min,max)=>{const v=env[key]===undefined?fallback:Number(env[key]);if(!Number.isInteger(v)||v<min||v>max)throw new Error('Cấu hình '+key+' không hợp lệ.');return v;};
  const port=integer('PORT',3000,1,65535),origin=env.APP_ORIGIN||'http://localhost:'+port,url=new URL(origin);
  if(!['http:','https:'].includes(url.protocol)||url.origin!==origin)throw new Error('APP_ORIGIN phải là origin chính xác, không có path/trailing slash.');
  const password=env.AI_ACCESS_PASSWORD||'';
  if(password&&(password.length<16||password.length>256))throw new Error('AI_ACCESS_PASSWORD cần từ 16–256 ký tự.');
  const dataMode=env.APP_DATA_MODE||'preview';if(!['preview','cloud'].includes(dataMode))throw new Error('APP_DATA_MODE chỉ nhận preview hoặc cloud.');
  return {host:env.HOST||'127.0.0.1',port,origin,dataMode,password,apiKey:env.OPENROUTER_API_KEY||'',model:env.OPENROUTER_MODEL||'openai/gpt-4.1-mini',timeoutMs:integer('AI_TIMEOUT_MS',90000,1000,120000),maxTokens:integer('AI_MAX_OUTPUT_TOKENS',5000,500,12000),hourLimit:integer('AI_MAX_REQUESTS_PER_HOUR',20,1,200)};
}
function createApp(config,{fetchImpl=fetch,root=ROOT}={}){
  const sessions=new Map(),loginAttempts=new Map(),calls=[];
  const salt=crypto.randomBytes(16),passwordHash=crypto.scryptSync(config.password,salt,32);
  let active=0;
  const ready=!!(config.apiKey&&config.model&&config.password),ttl=30*60*1000;
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  const cookie=(id,age)=>'gp_ai_session='+id+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+age+(config.origin.startsWith('https:')?'; Secure':'');
  const session=req=>{const id=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('gp_ai_session='))?.slice(14);const s=sessions.get(id);if(!s||s.expires<Date.now()){sessions.delete(id);return null;}return {...s,id};};
  const body=async req=>{if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new AppError(415,'Chỉ nhận application/json.');let size=0,parts=[];for await(const p of req){size+=p.length;if(size>256*1024)throw new AppError(413,'Dữ liệu gửi lên vượt 256 KB.');parts.push(p);}try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new AppError(400,'JSON không hợp lệ.');}};
  const prune=()=>{const now=Date.now();for(const [k,s] of sessions)if(s.expires<now)sessions.delete(k);for(const [k,s] of loginAttempts)if(s.until<now)loginAttempts.delete(k);while(calls.length&&calls[0]<now-3600000)calls.shift();};
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,config.origin),pathname=url.pathname;
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
      if(pathname.startsWith('/api/')){
        prune();
        if(req.method==='GET'&&pathname==='/api/health')return json(res,200,{ok:true,app:'GenPlayer',dataMode:config.dataMode});
        if(req.method==='GET'&&pathname==='/api/ai/status'){const s=session(req);return json(res,200,{configured:ready,authenticated:!!s,csrf:s?.csrf||null,model:config.model,tasks:TASKS,dataMode:config.dataMode,missing:[!config.apiKey&&'OPENROUTER_API_KEY',!config.password&&'AI_ACCESS_PASSWORD'].filter(Boolean),remainingRequests:Math.max(0,config.hourLimit-calls.length)});}
        if(req.method!=='POST')throw new AppError(404,'Không có API này.');
        if(req.headers.origin!==config.origin)throw new AppError(403,'Origin không hợp lệ. Hãy mở đúng APP_ORIGIN.');
        if(pathname==='/api/ai/login'){
          if(!ready)throw new AppError(503,'AI chưa cấu hình. Điền OPENROUTER_API_KEY và AI_ACCESS_PASSWORD trong .env rồi khởi động lại.');
          const ip=req.socket.remoteAddress,attempt=loginAttempts.get(ip)||{count:0,until:Date.now()+15*60000};
          if(attempt.count>=5)throw new AppError(429,'Quá nhiều lần đăng nhập. Thử lại sau 15 phút.');
          if(loginAttempts.size>1000&&!loginAttempts.has(ip))throw new AppError(429,'Tạm giới hạn đăng nhập.');
          const data=await body(req),pw=data.password;
          const valid=typeof pw==='string'&&pw.length<=256&&crypto.timingSafeEqual(crypto.scryptSync(pw,salt,32),passwordHash);
          if(!valid){attempt.count++;loginAttempts.set(ip,attempt);throw new AppError(401,'Sai mật khẩu truy cập AI.');}
          if(sessions.size>=100)throw new AppError(429,'Đã đạt giới hạn phiên AI.');
          const old=session(req);if(old)sessions.delete(old.id);
          const id=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(32).toString('hex');
          sessions.set(id,{csrf,expires:Date.now()+ttl});loginAttempts.delete(ip);res.setHeader('Set-Cookie',cookie(id,ttl/1000));return json(res,200,{ok:true,csrf});
        }
        const s=session(req);if(!s)throw new AppError(401,'Hãy đăng nhập quyền truy cập AI (phiên có hiệu lực 30 phút).');
        if(req.headers['x-gp-csrf']!==s.csrf)throw new AppError(403,'Phiên bảo vệ đã đổi. Mở lại khu vực AI rồi thử lại.');
        if(pathname==='/api/ai/logout'){sessions.delete(s.id);res.setHeader('Set-Cookie',cookie('',0));return json(res,200,{ok:true});}
        if(pathname!=='/api/ai/run')throw new AppError(404,'Không có API này.');
        if(!ready)throw new AppError(503,'AI chưa được cấu hình.');
        if(active>=2)throw new AppError(429,'Có 2 yêu cầu AI đang chạy. Hãy chờ hoàn tất.');
        if(calls.length>=config.hourLimit)throw new AppError(429,'Đã hết số lượt AI cho phép trong giờ này.');
        const prepared=prepare(await body(req));
        // Recheck after asynchronous body reading so concurrent requests cannot bypass limits.
        if(active>=2||calls.length>=config.hourLimit)throw new AppError(429,'Đã đạt giới hạn gọi AI.');
        active++;calls.push(Date.now());
        try{return json(res,200,{ok:true,task:prepared.task,output:await complete(prepared,config,fetchImpl)});}finally{active--;}
      }
      if(!['GET','HEAD'].includes(req.method))throw new AppError(405,'Method không được hỗ trợ.');
      let file,type;
      if(['/', '/index.html','/score-update.html'].includes(pathname)){
        file=path.join(root,'dist','index.html');
        if(!fs.existsSync(file))throw new AppError(503,'Chưa build web app. Chạy npm run build trước.');
        const runtime={backend:true,dataMode:config.dataMode};
        const html=fs.readFileSync(file,'utf8').replace('window.GP_APP_CONFIG=null','window.GP_APP_CONFIG='+JSON.stringify(runtime));
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:html);
      }
      if(['/sw.js','/manifest.webmanifest'].includes(pathname))file=path.join(root,pathname.slice(1));
      else if(pathname.startsWith('/assets/')){
        const rel=decodeURIComponent(pathname);if(rel.includes('\0')||rel.includes('\\')||rel.split('/').some(s=>s.startsWith('.')))throw new AppError(404,'Không tìm thấy tài nguyên.');
        const assetRoot=path.join(root,'assets')+path.sep;file=path.resolve(root,'.'+rel);
        if(!file.startsWith(assetRoot))throw new AppError(404,'Không tìm thấy tài nguyên.');
        if(fs.existsSync(file)&&!fs.realpathSync(file).startsWith(fs.realpathSync(path.join(root,'assets'))+path.sep))throw new AppError(404,'Không tìm thấy tài nguyên.');
      }else throw new AppError(404,'Không tìm thấy trang.');
      if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw new AppError(404,'Không tìm thấy tài nguyên.');
      type={'.js':'application/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json'}[path.extname(file).toLowerCase()]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':type,'Cache-Control':pathname==='/sw.js'?'no-cache':'public, max-age=3600'});
      if(req.method==='HEAD')return res.end();fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    }catch(e){if(!res.headersSent)json(res,e instanceof AppError?e.status:500,{ok:false,error:e instanceof AppError?e.message:'Server không xử lý được yêu cầu.'});else res.destroy();}
  });
  server.requestTimeout=config.timeoutMs+15000;server.headersTimeout=15000;server.maxHeadersCount=50;
  return server;
}
if(require.main===module){
  try{loadEnv();const config=getConfig(),app=createApp(config);app.listen(config.port,config.host,()=>console.log('GenPlayer: '+config.origin+' · '+config.dataMode+' · AI '+(config.apiKey&&config.password?'đã cấu hình':'chưa cấu hình')));app.on('error',()=>{console.error('Không mở được server. Kiểm tra HOST/PORT.');process.exitCode=1;});}catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={loadEnv,getConfig,createApp};
