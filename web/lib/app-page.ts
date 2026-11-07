/** Shared by the routes that serve each app's page. */

/* Each app keeps its browser storage under its own prefix, so apps on the same site never mix data. */
export function storageShim(prefix: string) {
  const P = JSON.stringify(prefix);
  return (
    `(function(){var P=${P},S;try{S=window.localStorage}catch(e){return}` +
    "function ks(){var a=[];for(var j=0;j<S.length;j++){var k=S.key(j);if(k&&k.indexOf(P)===0)a.push(k.slice(P.length))}return a}" +
    "var o={getItem:function(k){return S.getItem(P+k)},setItem:function(k,v){S.setItem(P+k,String(v))},removeItem:function(k){S.removeItem(P+k)}," +
    "clear:function(){ks().forEach(function(k){S.removeItem(P+k)})},key:function(i){var a=ks();return a[i]==null?null:a[i]}};" +
    "Object.defineProperty(o,'length',{get:function(){return ks().length}});" +
    "try{Object.defineProperty(window,'localStorage',{value:o,configurable:true})}catch(e){}})();"
  );
}

/* claude.ai artifact links baked into the pages, and where they live on this site */
export function siteLinks(html: string, origin: string) {
  return html
    .replaceAll("https://claude.ai/artifact/Rp5GENCYKRYw6nnA2LJdE8", `${origin}/operations`)
    .replaceAll("https://claude.ai/artifact/XqWiKrqY6AnbRVYwFpFqmw", `${origin}/operations`)
    .replaceAll("https://claude.ai/artifact/HTnSSukvAoNNfVikhxhhqs", `${origin}/client`)
    .replaceAll("https://claude.ai/artifact/1du4BSTFvnCX4tamvmsKuG", `${origin}/app`);
}
