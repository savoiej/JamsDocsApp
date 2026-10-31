import os
APP=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','apps','jamsnet','index.html')
import asyncio,re,json
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'harness.py')).read().split('async def main')[0])
h=open(APP).read();i=h.index('<script type="text/plain" id="nlsrc">');av=h[:i]
acts=sorted(set(re.findall(r'data-act="([A-Za-z0-9_]+)"',av))|set(re.findall(r"act:'([A-Za-z0-9_]+)'",av)))
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await b.new_page()
        await pg.route(lambda u:u.startswith('https://'),lambda r:r.abort())
        await pg.set_content(h.replace('<head>','<head><script>'+FAKE+'</script>',1).replace("Object.assign(A,{ivToNetBilling","window.__A=A;Object.assign(A,{ivToNetBilling",1));await pg.wait_for_timeout(1500)
        miss=[a for a in acts if not await pg.evaluate(f"!!__A['{a}']")]
        print(miss);await b.close()
asyncio.run(main())
