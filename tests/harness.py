import asyncio,json
from playwright.async_api import async_playwright
FAKE="""
window.__paths=[];window.__store={};
function mkQ(path){const q={path,where:()=>q,orderBy:()=>q,limit:()=>q,
  get:async()=>({docs:[],size:0,empty:true,docChanges:()=>[]}),
  onSnapshot:(n)=>{__paths.push('sub:'+path);setTimeout(()=>n({docs:Object.entries(__store).filter(([k])=>k.startsWith(path+'/')&&k.slice(path.length+1).indexOf('/')<0).map(([k,v])=>({id:k.split('/').pop(),exists:true,data:()=>v,metadata:{}})),size:0,empty:true,docChanges:()=>[]}),0);return()=>{}},
  doc:(id)=>mkD(path+'/'+id),add:async d=>mkD(path+'/x')};return q}
function mkD(path){return {id:path.split('/').pop(),path,get:async()=>({id:path.split('/').pop(),exists:!!__store[path],data:()=>__store[path],metadata:{}}),
  set:async d=>{__paths.push('set:'+path);__store[path]=JSON.parse(JSON.stringify(d))},update:async d=>{__store[path]={...__store[path],...d}},delete:async()=>{delete __store[path]},
  onSnapshot:(n)=>{setTimeout(()=>n({id:path.split('/').pop(),exists:!!__store[path],data:()=>__store[path],metadata:{}}),0);return()=>{}},collection:p=>mkQ(path+'/'+p)}}
const DBF={doc:mkD,collection:mkQ};
const USERF={id:async()=>'u_me',canEdit:async()=>true,isOwner:async()=>true,can:async()=>true,me:async()=>({}),profiles:async()=>({})};
window.claude={use:async n=>n==='db'?DBF:n==='user'?USERF:null};
"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await b.new_page(viewport={'width':1400,'height':900})
        errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.on('console',lambda m:errs.append('console:'+m.text) if m.type=='error' else None)
        async def h(r):
            u=r.request.url
            if 'jspdf.umd' in u: await r.fulfill(path='/home/claude/nl/node_modules/jspdf/dist/jspdf.umd.min.js')
            elif 'autotable' in u: await r.fulfill(path='/home/claude/nl/node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js')
            else: await r.abort()
        await pg.route(lambda u:u.startswith('https://'),h)
        html=open('app.html').read().replace('<head>','<head><script>'+FAKE+'</script>',1)
        await pg.set_content(html);await pg.wait_for_timeout(1200)
        await pg.wait_for_timeout(1500);await pg.click('#nlnav [data-nlgo=overview]');await pg.wait_for_timeout(800)
        fr=pg.frame_locator('.nlframe')
        await pg.screenshot(path='n_welcome.png')
        await fr.locator('[data-act=loadSample]').first.click();await pg.wait_for_timeout(2000)
        await pg.screenshot(path='n_over.png')
        paths=await pg.evaluate("__paths");print('paths sample',[x for x in paths][:8],len(paths))
        print('non-prefixed',[x for x in paths if not x.split(':',1)[1].startswith('netline/v1/') and ('projects' in x or 'admin' in x)][:5])
        # billing: send invoice
        f=pg.frames[1]
        await pg.click('#nlnav [data-nlgo=billing]');await pg.wait_for_timeout(400)
        await pg.screenshot(path='n_bill.png')
        await fr.locator('[data-act=invNew]').click();await pg.wait_for_timeout(300)
        await fr.locator('#invForm button[type=submit]').click();await pg.wait_for_timeout(1200)
        print('toast',await fr.locator('#toast').inner_text(),'clients',await pg.inner_text('#bCl'))
        await pg.screenshot(path='n_billed.png')
        await fr.locator('[data-act=embInvoices]').click();await pg.wait_for_timeout(500)
        await pg.click('[data-act=crmTab][data-t=inv]');await pg.wait_for_timeout(300);await pg.screenshot(path='n_inv.png');print('view ok')
        await pg.click('#nlnav [data-nlgo=overview]');await pg.wait_for_timeout(300)
        await pg.click('#nlnav [data-nlgo=admin]');await pg.wait_for_timeout(400)
        await pg.screenshot(path='n_admin.png')
        await pg.set_viewport_size({'width':390,'height':800});await pg.wait_for_timeout(400)
        await pg.screenshot(path='n_mob.png')
        print(errs[:10]);await b.close()
asyncio.run(main())
