import os
APP=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','apps','jamsnet','index.html')
import asyncio,json,re
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'harness.py')).read().split('async def main')[0])
SKIP=re.compile(r'del|remove|void|discard|reset|clear|purge|wipe|logout|print|pdf|csv|download|backup|export|save|send|sign|dictat|mic|record|camera|photo|upload|import|fullscreen|fs|ask|chat|sample|ai|find|search',re.I)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await b.new_page(viewport={'width':1400,'height':900})
        errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.route(lambda u:u.startswith('https://'),lambda r:r.abort())
        html=open(APP).read().replace('<head>','<head><script>'+FAKE+'</script>',1).replace("Object.assign(A,{ivToNetBilling","window.__A=A;window.__go=go;window.__V=VIEWS;window.__S=S;window.__co=closeOverlay;Object.assign(A,{ivToNetBilling",1)
        await pg.set_content(html);await pg.wait_for_timeout(2500)
        await pg.evaluate("__go('contracts')");await pg.click('[data-act=ctSample]');await pg.wait_for_timeout(200)
        views=await pg.evaluate("__V")
        report={'missingAct':{},'badGo':{},'errors':{},'hrefs':set()}
        for v in views:
            if v=='networks':continue
            await pg.evaluate(f"__co();__go('{v}')");await pg.wait_for_timeout(250)
            info=await pg.evaluate("""()=>{const root=document.querySelector('#v-'+__S.view);const els=[...document.querySelectorAll('#nav [data-act],#topbar [data-act]'),...root.querySelectorAll('[data-act],[data-go],a[href]')];
              return els.map(e=>({act:e.dataset.act||'',go:e.dataset.go||'',href:e.getAttribute('href')||'',txt:(e.textContent||'').trim().slice(0,40),dis:!!e.disabled}))}""")
            print(v,len(info),flush=True)
            for i in info:
                if i['act'] and not await pg.evaluate(f"!!__A['{i['act']}']"):report['missingAct'].setdefault(v,set()).add(i['act']+' «'+i['txt']+'»')
                if i['go'] and i['go'] not in views:report['badGo'].setdefault(v,set()).add(i['go'])
                if i['href']:report['hrefs'].add(i['href'][:80])
            # click smoke test
            n=await pg.evaluate("document.querySelectorAll('#v-'+__S.view+' [data-act],#v-'+__S.view+' [data-go]').length")
            for k in range(min(n,80)):
                d=await pg.evaluate(f"""()=>{{const e=document.querySelectorAll('#v-'+__S.view+' [data-act],#v-'+__S.view+' [data-go]')[{k}];return e?{{act:e.dataset.act||'',go:e.dataset.go||'',txt:(e.textContent||'').trim().slice(0,30),dis:!!e.disabled,tag:e.tagName}}:null}}""")
                if not d or d['dis'] or SKIP.search(d['act']) or d['tag'] in ('INPUT','SELECT'):continue
                before=len(errs)
                try:await pg.evaluate(f"document.querySelectorAll('#v-'+__S.view+' [data-act],#v-'+__S.view+' [data-go]')[{k}].click()")
                except Exception as ex:errs.append(str(ex))
                await pg.wait_for_timeout(80)
                if len(errs)>before:report['errors'].setdefault(v,[]).append((d['act'] or 'go:'+d['go'],d['txt'],errs[before][:160]))
                # dialog buttons too
                ov=await pg.evaluate("[...document.querySelectorAll('#overlay [data-act]')].map(e=>e.dataset.act)")
                for a in set(ov):
                    if not await pg.evaluate(f"!!__A['{a}']"):report['missingAct'].setdefault(v+' (dialog)',set()).add(a)
                await pg.evaluate(f"__co();if(__S.view!=='{v}')__go('{v}')");await pg.wait_for_timeout(40)
        for k in ('missingAct','badGo'):report[k]={a:sorted(b) for a,b in report[k].items()}
        report['hrefs']=sorted(report['hrefs'])
        print(json.dumps(report,indent=1))
        await b.close()
asyncio.run(main())
