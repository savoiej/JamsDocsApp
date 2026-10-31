import os
HERE=os.path.dirname(os.path.abspath(__file__))
import asyncio,json,urllib.parse as up
from playwright.async_api import async_playwright
STORE={}  # path -> row
CALLS=[]
def match(row,params):
    for k,v in params.items():
        if k in('select','order','offset','limit','on_conflict','columns'):continue
        op,_,val=v[0].partition('.')
        if op=='eq' and str(row.get(k))!=val:return False
        if op=='in':
            vals=val.strip('()').split(',')
            if str(row.get(k)) not in vals:return False
    return True
async def rest(route):
    req=route.request;u=up.urlparse(req.url);params=up.parse_qs(u.query);table=u.path.split('/')[-1];m=req.method
    CALLS.append((m,table,u.query[:80]))
    if table=='profiles':
        return await route.fulfill(status=200,content_type='application/json',body=json.dumps([{"id":"u1","full_name":"Test Admin","email":"a@x.com"}]))
    if m=='GET':
        rows=[r for r in sorted(STORE.values(),key=lambda r:r['path']) if match(r,params)]
        off=int(params.get('offset',['0'])[0]);lim=int(params.get('limit',['100000'])[0]);rows=rows[off:off+lim]
        if 'object+json' in (req.headers.get('accept') or ''):
            if not rows:return await route.fulfill(status=406,content_type='application/json',body=json.dumps({"code":"PGRST116","message":"none"}))
            return await route.fulfill(status=200,content_type='application/json',body=json.dumps(rows[0]))
        return await route.fulfill(status=200,content_type='application/json',body=json.dumps(rows))
    if m=='POST':
        body=json.loads(req.post_data or '[]');body=body if isinstance(body,list) else [body]
        for b in body:STORE[b['path']]=b
        return await route.fulfill(status=201,content_type='application/json',body='[]')
    if m=='DELETE':
        for p in [r['path'] for r in STORE.values() if match(r,params)]:del STORE[p]
        return await route.fulfill(status=204,body='')
    return await route.fulfill(status=200,body='[]')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await b.new_page(viewport={'width':1400,'height':900})
        errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.route('**/rest/v1/**',rest)
        await pg.route(lambda u:'fonts.g' in u or 'cdnjs' in u or 'realtime' in u,lambda r:r.abort())
        html=open(os.path.join(HERE,'..','jamsnet','index.html')).read()
        bridge=open(os.path.join(HERE,'.bridge.js')).read()
        PAGE='<html><body style="margin:0"><script>'+bridge+'</script><div id=root style="height:100vh"></div></body></html>'
        await pg.route('http://jams.test/**',lambda r:r.fulfill(status=200,content_type='text/html',body=PAGE))
        await pg.goto('http://jams.test/app')
        await pg.evaluate("""(html)=>{window.jamsBridge=createBridge({id:'u1',email:'a@x.com',full_name:'Test Admin',role:'admin',active:true,created_at:''});
          const shim="<script>Object.defineProperty(window,'claude',{value:{use:function(n){return parent.jamsBridge.use(n)}},configurable:true})<\\/script>";
          const f=document.createElement('iframe');f.style.cssText='width:100%;height:100%;border:0';f.srcdoc=html.replace('<head>','<head>'+shim);document.getElementById('root').appendChild(f)}""",html)
        await pg.wait_for_timeout(4000)
        app=pg.frames[1]
        print('sync',await app.inner_text('#sync') if await app.locator('#sync').count() else '?')
        # create a client in the AV app and see it saved as a document
        await app.click("[data-act=newMenu]");await app.click("[data-act=newPick][data-i='1']");await app.fill('#ncN','Moana Hotels');await app.click('[data-act=createClient]');await pg.wait_for_timeout(2500)
        print('docs after client:',sorted(STORE.keys())[:12])
        cl=STORE.get('meta/clients');print('clients doc has Moana:', 'Moana' in json.dumps(cl))
        # network docs: open, load example network, check documents
        await pg.keyboard.press('Escape');await app.evaluate("document.querySelector('#overlay').hidden=true");await app.click('[data-nlgo=overview]');await pg.wait_for_timeout(2500)
        nl=pg.frames[2]
        await nl.click('[data-act=loadSample]');await pg.wait_for_timeout(5000)
        nk=[k for k in STORE if k.startswith('netline/v1/')]
        print('network docs saved:',len(nk),'e.g.',nk[:4])
        print('network view',await nl.evaluate("S.mode+' '+S.projects.size+' '+S.data.devices.size"))
        # reload from the store: new page reads the same data back
        STORE_copy=dict(STORE)
        pg2=await b.new_page();e2=[];pg2.on('pageerror',lambda e:e2.append(str(e)))
        await pg2.route('**/rest/v1/**',rest);await pg2.route(lambda u:'fonts.g' in u or 'cdnjs' in u or 'realtime' in u,lambda r:r.abort())
        await pg2.route('http://jams.test/**',lambda r:r.fulfill(status=200,content_type='text/html',body=PAGE))
        await pg2.goto('http://jams.test/app')
        await pg2.evaluate("""(html)=>{window.jamsBridge=createBridge({id:'u2',email:'u@x.com',full_name:'Basic User',role:'user',active:true,created_at:''});
          const shim="<script>Object.defineProperty(window,'claude',{value:{use:function(n){return parent.jamsBridge.use(n)}},configurable:true})<\\/script>";
          const f=document.createElement('iframe');f.style.cssText='width:100%;height:100%;border:0';f.srcdoc=html.replace('<head>','<head>'+shim);document.getElementById('root').appendChild(f)}""",html)
        await pg2.wait_for_timeout(5000)
        a2=pg2.frames[1]
        print('second window sees client:',await a2.evaluate("document.querySelector('#bCl')?.textContent"))
        print('basic user nav has admin console:',await a2.evaluate("!!document.querySelector('[data-nlgo=admin]')"))
        print('errors',errs[:5],e2[:5])
        await b.close()
asyncio.run(main())
