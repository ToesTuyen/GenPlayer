// Optional local static preview server. No AI API, proxy or credential handling.
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
function loadEnv(file=path.join(ROOT,'.env')){
  if(!fs.existsSync(file))return;
  for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(!m||!['HOST','PORT','APP_ORIGIN','APP_DATA_MODE'].includes(m[1])||process.env[m[1]]!==undefined)continue;
    let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);
    process.env[m[1]]=v;
  }
}

function getConfig(env=process.env){
  const port=env.PORT===undefined?3000:Number(env.PORT);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT không hợp lệ.');
  const origin=env.APP_ORIGIN||'http://localhost:'+port,url=new URL(origin);
  if(!['http:','https:'].includes(url.protocol)||url.origin!==origin)throw new Error('APP_ORIGIN phải là origin chính xác, không có path/trailing slash.');
  const dataMode=env.APP_DATA_MODE||'preview';if(!['preview','cloud'].includes(dataMode))throw new Error('APP_DATA_MODE chỉ nhận preview hoặc cloud.');
  return {host:env.HOST||'127.0.0.1',port,origin,dataMode};
}
function createApp(config,{root=ROOT,injectRuntime=true}={}){
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,config.origin),pathname=url.pathname;
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
      if(pathname.startsWith('/api/'))throw new HttpError(404,'Không có API ứng dụng; trình duyệt gọi OpenRouter trực tiếp.');
      if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'Method không được hỗ trợ.');
      let file,type;
      if(['/', '/index.html','/score-update.html'].includes(pathname)){
        file=path.join(root,'dist','index.html');
        if(!fs.existsSync(file))throw new HttpError(503,'Chưa build web app. Chạy npm run build trước.');
        const runtime=injectRuntime?{dataMode:config.dataMode}:null;
        const html=fs.readFileSync(file,'utf8').replace('window.GP_APP_CONFIG=null','window.GP_APP_CONFIG='+JSON.stringify(runtime));
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:html);
      }
      if(['/sw.js','/manifest.webmanifest'].includes(pathname))file=path.join(root,pathname.slice(1));
      else if(pathname.startsWith('/assets/')){
        const rel=decodeURIComponent(pathname);if(rel.includes('\0')||rel.includes('\\')||rel.split('/').some(s=>s.startsWith('.')))throw new HttpError(404,'Không tìm thấy tài nguyên.');
        const assetRoot=path.join(root,'assets')+path.sep;file=path.resolve(root,'.'+rel);
        if(!file.startsWith(assetRoot))throw new HttpError(404,'Không tìm thấy tài nguyên.');
        if(fs.existsSync(file)&&!fs.realpathSync(file).startsWith(fs.realpathSync(path.join(root,'assets'))+path.sep))throw new HttpError(404,'Không tìm thấy tài nguyên.');
      }else throw new HttpError(404,'Không tìm thấy trang.');
      if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw new HttpError(404,'Không tìm thấy tài nguyên.');
      type={'.js':'application/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json'}[path.extname(file).toLowerCase()]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':type,'Cache-Control':pathname==='/sw.js'?'no-cache':'public, max-age=3600'});
      if(req.method==='HEAD')return res.end();fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    }catch(e){if(!res.headersSent)json(res,e instanceof HttpError?e.status:500,{ok:false,error:e instanceof HttpError?e.message:'Server không xử lý được yêu cầu.'});else res.destroy();}
  });

  server.requestTimeout=15000;server.headersTimeout=15000;server.maxHeadersCount=50;
  return server;
}
if(require.main===module){
  try{loadEnv();const config=getConfig(),app=createApp(config);app.listen(config.port,config.host,()=>console.log('GenPlayer (static): '+config.origin+' · '+config.dataMode+' · AI gọi trực tiếp từ trình duyệt'));app.on('error',()=>{console.error('Không mở được máy chủ file. Kiểm tra HOST/PORT.');process.exitCode=1;});}catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={loadEnv,getConfig,createApp};
