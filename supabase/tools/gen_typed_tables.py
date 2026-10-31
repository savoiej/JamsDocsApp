"""Generates the typed-tables migration from the field list below.

Every record JamsNET saves lands in public.documents as JSON. This script writes SQL that keeps
a typed table per kind of record in step with those documents (a database trigger), so every
field is a real column you can query, filter and report on in Supabase.

Usage: python3 supabase/tools/gen_typed_tables.py [observed-store.json] > migration.sql
  observed-store.json (optional) is a dump of documents from a test run; its fields are merged in.
"""
import json, re, sys
from collections import OrderedDict

# type codes: t text · n numeric · b boolean · j jsonb · d date · ts timestamp (epoch ms or ISO)
REN = {'prop': 'proposal', 'desc': 'description', 'primary': 'is_primary', 'end': 'end_date', 'start': 'start_date', 'when': 'scheduled_when',
       'void': 'is_void', 'order': 'sort_order', 'user': 'assigned_user', 'from': 'period_from', 'to': 'period_to',
       'a': 'end_a', 'b': 'end_b', 'u': 'rack_unit', 'n': 'port', 'ah': 'after_hours', 'hrs': 'hours', 'inv': 'invoice_id',
       'pj': 'project_id', 'col': 'board_column', 'pri': 'priority', 'cat': 'category', 'dev': 'device', 'loc': 'location',
       'amt': 'amount', 't': 'time_label', 'm': 'message', 'key': 'period_key', 'ts': 'occurred_at', 'at': 'recorded_at',
       'uid': 'device_uid', 'pid': 'product_id', 'fp': 'floor_plan_position', 'ref': 'reference', 'len': 'length',
       'u_': 'u', 'ip': 'ip', 'os': 'os', 'id': 'record_id'}

def snake(k):
    if k in REN: return REN[k]
    s = re.sub(r'(?<!^)(?=[A-Z])', '_', k).lower()
    s = re.sub(r'[^a-z0-9_]', '_', s)
    return ('f_' + s) if s[0].isdigit() else s

def q(i): return '"' + i.replace('"', '""') + '"'

# ---------------------------------------------------------------- AV / business side
AV = [
 dict(table='clients', doc=r'^meta/clients$', arr='$', key='id', comment='Clients and prospects (Clients & invoices).',
      cols=[('name','t'),('type','t'),('status','t'),('address','t'),('phone','t'),('email','t'),('website','t'),('terms','t'),('created','t'),('log','j')],
      children=[dict(table='client_contacts', field='contacts', key='id', parent='client_id', comment='People at each client.',
                     cols=[('name','t'),('title','t'),('email','t'),('phone','t'),('primary','b')])]),
 dict(table='invoices', doc=r'^meta/invoices$', arr='$', key='id', comment='Invoices (Clients & invoices, Time & invoicing, service contracts, network time).',
      cols=[('no','t'),('clientId','t'),('pj','t'),('project','t'),('issued','d'),('terms','t'),('due','d'),('taxPct','n'),('sentAt','d'),('notes','t'),('void','b'),('src','j')],
      children=[dict(table='invoice_lines', field='lines', key=None, parent='invoice_id', comment='Line items on each invoice.',
                     cols=[('desc','t'),('qty','n'),('rate','n'),('tax','b')]),
                dict(table='invoice_payments', field='payments', key=None, parent='invoice_id', comment='Payments received against each invoice.',
                     cols=[('date','d'),('amount','n'),('method','t'),('ref','t')])]),
 dict(table='service_contracts', doc=r'^meta/contracts$', arr='$', key='id', comment='Service contracts with the companies you support.',
      cols=[('no','t'),('client','t'),('title','t'),('type','t'),('status','t'),('start','d'),('end','d'),('autoRenew','b'),('cycle','t'),('fee','n'),('hours','n'),('rate','n'),('ahRate','n'),('services','j'),('sla','j'),('coverage','t'),('sites','t'),('contact','t'),('scope','t'),('po','t'),('created','ts')],
      children=[dict(table='contract_visits', field='visits', key='id', parent='contract_id', comment='Service visits logged under each contract.',
                     cols=[('day','d'),('service','t'),('tech','t'),('hrs','n'),('site','t'),('ticket','t'),('note','t'),('ah','b'),('inv','t')]),
                dict(table='contract_billing_periods', field='billed', key=None, parent='contract_id', comment='Billing periods (and prepaid blocks) already invoiced per contract.',
                     cols=[('key','t'),('inv','t')])]),
 dict(table='service_tickets', doc=r'^meta/tickets-[0-9]+$', arr='$', key='id', comment='AV service desk tickets.',
      cols=[('site','t'),('issue','t'),('desc','t'),('pri','t'),('tech','t'),('col','t'),('when','t'),('due','t'),('cat','t'),('reporter','t'),('dev','j'),('devLabel','t'),('solution','t'),('wn','j'),('res','j'),('log','j'),('opened','ts'),('closed','ts')]),
 dict(table='store_registers', doc=r'^meta/registers-[0-9]+$', arr='$', key='id', comment='Store registers (Store systems).',
      cols=[('num','t'),('store','t'),('loc','t'),('type','t'),('status','t'),('note','t'),('created','ts'),('updated','ts')],
      children=[dict(table='register_devices', field='devices', key='id', parent='register_id', comment='Devices that make up each register.',
                     cols=[('role','t'),('make','t'),('model','t'),('serial','t'),('asset','t'),('ip','t'),('mac','t'),('host','t'),('sw','t'),('conn','t'),('note','t')])]),
 dict(table='store_inventory', doc=r'^meta/inventory-[0-9]+$', arr='$', key='id', comment='Store inventory items (Store systems).',
      cols=[('cat','t'),('store','t'),('loc','t'),('status','t'),('make','t'),('model','t'),('serial','t'),('asset','t'),('host','t'),('ip','t'),('mac','t'),('sw','t'),('imei','t'),('ext','t'),('user','t'),('warranty','t'),('note','t'),('log','j'),('created','ts'),('updated','ts')]),
 dict(table='products', doc=r'^meta/library$', arr='$.lib', key='id', comment='Your equipment library (products you added or edited).',
      cols=[('mfr','t'),('model','t'),('cat','t'),('desc','t'),('cost','n'),('msrp','n'),('labor','n'),('ru','t'),('watts','n'),('mount','t'),('ins','j'),('outs','j'),('imgs','j'),('slots','j'),('fits','t'),('spec','t'),('src','t')]),
 dict(table='pipeline_deals', doc=r'^meta/service$', arr='$.pipeline', key='id', comment='Sales pipeline entries shown on the dashboard.',
      cols=[('client','t'),('project','t'),('value','n'),('status','t'),('updated','t')]),
 dict(table='service_agreements', doc=r'^meta/service$', arr='$.agreements', key='id', comment='Older simple service agreements (before service contracts).',
      cols=[('client','t'),('plan','t'),('renews','t'),('status','t')]),
 dict(table='business_settings', doc=r'^meta/settings$', arr=None, key=None, comment='Your business details, pricing defaults and billing settings.',
      cols=[('name','t'),('tagline','t'),('address','t'),('phone','t'),('email','t'),('website','t'),('license','t'),('logo','t'),('markup','n'),('laborRate','n'),('laborPct','n'),('tax','n'),('internalRate','n'),('terms','t'),('deposit','n'),('validDays','n'),('payNote','t'),('billRate','n'),('billInc','n')]),
 dict(table='projects', doc=r'^projects/[^/]+$', arr=None, key='id', comment='Projects (AV installs, network jobs, service calls…) with their proposal and billing setup.',
      cols=[('job','t'),('site','t'),('created','t'),('u','n','id_counter'),
            ('prop.no','t'),('prop.client','t'),('prop.project','t'),('prop.ptype','t'),('prop.services','j'),('prop.status','t'),
            ('prop.markup','n'),('prop.laborMethod','t'),('prop.laborRate','n'),('prop.laborPct','n'),('prop.tax','n'),
            ('prop.signedTotal','n'),('prop.signer','j'),('prop.link','j'),('prop.startDate','d'),('prop.dueDate','d'),('prop.po','t'),('prop.scope','t'),
            ('prop.billRate','n'),('prop.billing','j'),('prop.log','j'),('prop','j'),
            ('design.meta','j'),('design.plan','j'),('design.extras','j'),('design.panels','j'),('design.seq','n'),('design.meta2','j'),('design.meta3','j'),('design.meta4','j'),('design.meta5','j')],
      children=[dict(table='project_tasks', field='tasks', key='id', parent='project_id', comment='Tasks on each project board.',
                     cols=[('title','t'),('who','t'),('col','t'),('start','n','start_day'),('dur','n','duration_days'),('ev','t','calendar_event'),('note','t')]),
                dict(table='time_entries', field='time', key='id', parent='project_id', comment='Hours logged on projects (Time & invoicing, project time log, field clock).',
                     cols=[('day','d'),('hrs','n'),('task','t'),('type','t'),('who','t'),('rate','n'),('note','t'),('billable','b'),('invoiceId','t')]),
                dict(table='project_photos', field='photos', key='id', parent='project_id', comment='Site photos taken in the field app.',
                     cols=[('asset','t'),('uid','t'),('tag','t'),('caption','t'),('at','ts'),('who','t')]),
                dict(table='design_devices', field='design.nodes', key='uid', parent='project_id', comment='Devices placed on each project’s AV drawings.',
                     cols=[('pid','t'),('x','n'),('y','n'),('tag','t'),('label','t'),('loc','t'),('fp','j'),('mods','j')]),
                dict(table='design_cables', field='design.cables', key='id', parent='project_id', comment='Cables on each project’s AV drawings (cable schedule).',
                     cols=[('type','t'),('a','j'),('b','j'),('sku','t'),('len','n'),('status','t'),('note','t'),('label','t')]),
                dict(table='design_racks', field='design.racks', key='id', parent='project_id', comment='Equipment racks on each project’s drawings.',
                     cols=[('name','t'),('size','n'),('items','j'),('fp','j')])]),
]

# ---------------------------------------------------------------- network docs side
NET_TYPES = ([
 ('sites','net_sites','Sites and locations.'),('rooms','net_rooms','Equipment rooms (MDF, IDF, closets).'),('racks','net_racks','Racks in each room.'),
 ('devices','net_devices','Network devices, patch panels and wall jacks.'),('cables','net_cables','Cable schedule, port to port.'),
 ('vlans','net_vlans','VLAN plan.'),('subnets','net_subnets','Subnets.'),('ips','net_ip_addresses','Documented IP addresses.'),
 ('circuits','net_circuits','WAN circuits.'),('wifi','net_wifi','Wireless networks (SSIDs).'),('assets','net_inventory','Site inventory (workstations, printers, phones…).'),
 ('tickets','net_tickets','Network tickets.'),('plans','net_floor_plans','Floor plans.'),('revs','net_revisions','Issued revisions of the document set.'),
 ('maint','net_maintenance','Recurring maintenance tasks.'),('fw','net_firewall_policies','Firewall policies.'),('nat','net_port_forwards','Port forwards (NAT).'),
 ('vpns','net_vpns','VPN tunnels.'),('dns','net_dns_records','DNS records.'),('cloud','net_cloud_services','Cloud and SaaS services.'),
 ('contacts','net_contacts','Contacts and escalation order.'),('runbooks','net_runbooks','Runbooks.'),('power','net_power_feeds','Which power outlet feeds each device.'),
 ('psrc','net_power_sources','UPS units and PDUs.'),('time','net_time_entries','Time logged on network tickets.'),('invoices','net_invoices','Network billing (invoices and billing files).'),
 ('activity','net_activity','Change history for each network.')])
SYS = [('updatedAt','ts'),('updatedBy','t'),('createdAt','ts')]
NET_EXTRA = {
 'devices': [('siteId','t'),('roomId','t'),('rackId','t'),('u','n'),('uh','n'),('hostname','t'),('role','t'),('vendor','t'),('model','t'),('serial','t'),('status','t'),('os','t'),('mgmtIp','t'),('credRef','t'),('location','t'),('purchased','t'),('warranty','t'),('eosl','t'),('replaceCost','n'),('lifeYears','n'),('draw','n'),('pos','j'),('notes','t')],
 'cables': [('a','j'),('b','j'),('media','t'),('label','t'),('status','t'),('color','t'),('lengthM','n'),('notes','t')],
 'plans': [('name','t'),('siteId','t'),('floor','t'),('widthM','n'),('w','n'),('h','n'),('imageId','t'),('notes','t')],
 'revs': [('rev','t'),('issuedAt','ts'),('note','t'),('changes','j'),('counts','j'),('size','n'),('snapId','t')],
 'maint': [('title','t'),('category','t'),('every','n'),('unit','t'),('next','d'),('lead','n'),('siteId','t'),('deviceIds','j'),('assignee','t'),('checklist','j'),('lastDone','d'),('history','j')],
 'tickets': [('num','n'),('created','ts'),('resolution','t'),('resolvedAt','ts'),('log','j')],
 'time': [('ticketId','t'),('invoiceId','t'),('at','ts')],
 'invoices': [('no','t'),('date','d'),('due','d'),('billTo','t'),('note','t'),('from','d'),('to','d'),('status','t'),('via','t'),('taxRate','n'),('minutes','n'),('subtotal','n'),('tax','n'),('total','n'),('entryIds','j')],
 'activity': [('ts','ts'),('uid','t','user_id'),('text','t')],
 'assets': [('link','j'),('pos','j')],
 'ips': [('type','t')],
}
NET_CHILDREN = {
 'devices': [dict(table='net_device_ports', field='ports', key=None, parent='device_id', comment='Ports on each network device.',
                  cols=[('n','t'),('media','t'),('desc','t'),('mode','t'),('vlan','t'),('vlans','t'),('speed','t'),('ip','t'),('poe','t')])],
 'invoices': [dict(table='net_invoice_lines', field='lines', key=None, parent='invoice_id', comment='Lines on each network invoice.',
                   cols=[('ticket','t'),('title','t'),('site','t'),('date','d'),('tech','t'),('minutes','n'),('rate','n'),('note','t'),('amount','n')])],
}
NET_OTHER = [
 dict(table='networks', doc=r'^netline/v1/projects/[^/]+$', arr=None, key='id', net=False, comment='Documented networks (one per client or campus).',
      cols=[('name','t'),('client','t'),('engineer','t'),('rev','t'),('notes','t'),('rate','n'),('incr','n'),('terms','t'),('taxRate','n'),('billTo','t'),('billVia','t'),('invNote','t'),('account','t'),('ent','j'),('createdAt','ts')]),
 dict(table='net_subscription_plans', doc=r'^netline/v1/admin/cfg/plans/[^/]+$', arr=None, key='id', admin=True, comment='Network docs plans sold to customers (admins only).',
      cols=[('name','t'),('price','n'),('networks','n'),('seats','n'),('order','n'),('modules','j')]),
 dict(table='net_customer_accounts', doc=r'^netline/v1/admin/cfg/accounts/[^/]+$', arr=None, key='id', admin=True, comment='Network docs customer accounts (admins only).',
      cols=[('name','t'),('contact','t'),('email','t'),('phone','t'),('plan','t'),('status','t'),('cycle','t'),('seats','n'),('trialEnds','d'),('overrides','j'),('notes','t'),('created','t')]),
 dict(table='net_portal_requests', doc=r'^netline/v1/portal/inbox/requests/[^/]+$', arr=None, key='id', comment='Service requests sent from the client portal.',
      cols=[('pid','t','network'),('title','t'),('description','t'),('priority','t'),('siteId','t'),('requester','t'),('contact','t'),('created','ts'),('by','t','sent_by'),('status','t'),('ticketId','t')]),
]

def infer(v):
    if isinstance(v, bool): return 'b'
    if isinstance(v, (int, float)): return 'n'
    if isinstance(v, (dict, list)): return 'j'
    return 't'

def merge(cols, more):
    seen = {c[0] for c in cols}
    for m in more:
        c = m[0]
        if c not in seen and c[:1].islower() and re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', c):
            cols.append(tuple(m)); seen.add(c)
    return cols

def load_schema(html):
    i = html.index('const SCHEMA={'); j = html.index('\n};', i); s = html[i:j]; out = {}
    for m in re.finditer(r"\n (\w+):\{label:'[^']*',fields:\[(.*)", s):
        keys = [(k, {'number': 'n'}.get(ty, 't')) for k, ty in re.findall(r"\[\s*'(\w+)','[^']*','(text|textarea|select|number)'", m.group(2))]
        out[m.group(1)] = keys
    return out

def build(store, schema):
    net = []
    for t, table, comment in NET_TYPES:
        cols = list(schema.get(t, []))
        cols = merge(cols, NET_EXTRA.get(t, []))
        # fields seen in real saved records
        for p, row in (store or {}).items():
            if re.match(r'^netline/v1/projects/[^/]+/' + t + r'/[^/]+$', p):
                cols = merge(cols, [(k, ('ts' if k.endswith('At') and isinstance(v, (int, float)) else infer(v))) for k, v in row['data'].items() if k not in ('id', 'ports', 'lines')])
        cols = [c for c in cols if c[0] not in [x[0] for x in SYS]] + SYS
        if t == 'cables': cols = [c if c[0] not in ('a', 'b') else (c[0], 'j') + tuple(c[2:]) for c in cols]
        net.append(dict(table=table, doc=r'^netline/v1/projects/[^/]+/' + t + r'/[^/]+$', arr=None, key='id', net=True, comment=comment + ' (Network docs)',
                        cols=cols, children=NET_CHILDREN.get(t, [])))
    return AV + net + NET_OTHER

# ---------------------------------------------------------------- SQL
def val(src, k, ty):
    path = k.split('.')
    expr = src + ''.join(f"->'{p}'" for p in path)
    return {'t': f"private.j_text({expr})", 'n': f"private.j_num({expr})", 'b': f"private.j_bool({expr})",
            'j': f"nullif({expr}, 'null'::jsonb)", 'd': f"private.j_date({expr})", 'ts': f"private.j_ts({expr})"}[ty]

PGT = {'t': 'text', 'n': 'numeric', 'b': 'boolean', 'j': 'jsonb', 'd': 'date', 'ts': 'timestamptz'}

def colname(k):
    if '.' in k:
        head, rest = k.split('.', 1)
        pre = {'prop': 'proposal_', 'design': 'drawing_'}.get(head, head + '_')
        return pre + snake(rest.replace('.', '_'))
    return snake(k)

def table_sql(spec, parent=None):
    t = spec['table']; lines = [f"create table public.{q(t)} (", "  row_id bigint generated always as identity primary key,", "  source_path text not null,"]
    if spec.get('net'): lines.append("  network_id text not null,")
    if parent: lines.append(f"  {q(spec['parent'])} text,")
    if spec.get('key') or parent is None:
        lines.append("  id text,")
    if parent and not spec.get('key'): lines.append("  line_no integer not null,")
    used = {'row_id', 'source_path', 'network_id', 'id', 'line_no', spec.get('parent')}
    for k, ty in spec['cols']:
        c = colname(k)
        if c in used: c = c + '_value'
        used.add(c)
        lines.append(f"  {q(c)} {PGT[ty]},")
    lines.append("  extra jsonb,")
    lines.append("  synced_at timestamptz not null default now()")
    lines.append(");")
    out = "\n".join(lines) + "\n"
    out += f"comment on table public.{q(t)} is {sqlstr(spec['comment'] + ' Kept in step with the app automatically; read-only.')};\n"
    out += f"create index on public.{q(t)} (source_path);\n"
    if parent: out += f"create index on public.{q(t)} ({q(spec['parent'])});\n"
    if spec.get('net'): out += f"create index on public.{q(t)} (network_id);\n"
    if spec.get('key') or parent is None: out += f"create index on public.{q(t)} (id);\n"
    out += f"alter table public.{q(t)} enable row level security;\n"
    cond = "(select private.is_admin())" if spec.get('admin') else "(select private.is_member())"
    out += f"create policy {q('Team members read ' + t.replace('_',' '))} on public.{q(t)} for select to authenticated using ({cond});\n"
    out += f"grant select on public.{q(t)} to authenticated;\n"
    return out, used

def sqlstr(s): return "'" + s.replace("'", "''") + "'"

def colnames(spec):
    used = {'row_id', 'source_path', 'network_id', 'id', 'line_no', spec.get('parent')}; out = []
    for col in spec['cols']:
        k, ty = col[0], col[1]
        c = col[2] if len(col) > 2 else colname(k)
        if c in used: c = c + '_value'
        used.add(c); out.append((k, ty, c))
    return out

def mapped_keys(spec, extra_keys=()):
    top = sorted({k.split('.')[0] for k, _ in spec['cols']} | set(extra_keys))
    return "array[" + ",".join(sqlstr(k) for k in top) + "]::text[]"

def insert_sql(spec, rows_from, elem, parent=None, parent_elem=None):
    cols = colnames(spec); t = spec['table']
    names = ['source_path'] + (['network_id'] if spec.get('net') else []) + ([spec['parent']] if parent else [])
    vals = ['p'] + (['net_id'] if spec.get('net') else []) + ([f"private.j_text({parent_elem}->'{parent}')"] if parent else [])
    if spec.get('key') or not parent:
        names.append('id'); vals.append("doc_id" if (not parent and spec.get('doc_level')) else (f"private.j_text({elem}->'{spec['key']}')" if spec.get('key') else 'null'))
    if parent and not spec.get('key'):
        names.append('line_no'); vals.append('ord::integer')
    for k, ty, c in cols:
        names.append(c); vals.append(val(elem, k, ty))
    child_fields = [ch['field'].split('.')[0] for ch in spec.get('children', [])]
    keyset = [spec['key']] if spec.get('key') else []
    names.append('extra'); vals.append(f"nullif({elem} - {mapped_keys(spec, keyset + child_fields)}, '{{}}'::jsonb)")
    return (f"insert into public.{q(t)} ({', '.join(q(n) for n in names)})\n  select {', '.join(vals)}\n  {rows_from};\n")

def handler(spec):
    """SQL block that re-syncs one document into spec's table(s)."""
    tables = [spec['table']] + [c['table'] for c in spec.get('children', [])]
    s = f"  if p ~ {sqlstr(spec['doc'])} then\n    matched := true;\n"
    if spec.get('net'): s += "    net_id := split_part(p, '/', 4);\n"
    for t in tables: s += f"    delete from public.{q(t)} where source_path = p;\n"
    s += "    if d is not null then\n"
    body = private_body = ''
    if spec['arr'] is None:
        # the document itself is one record
        spec2 = dict(spec, doc_level=True)
        body += insert_sql(spec2, "", 'v')
        for ch in spec.get('children', []):
            path = "".join(f"->'{x}'" for x in ch['field'].split('.'))
            frm = f"from private.j_arr(v{path}) with ordinality as x(c, ord)"
            ch2 = dict(ch, net=spec.get('net'))
            body += insert_sql_child(ch2, frm, 'c', parent_id_expr="doc_id")
    else:
        path = "".join(f"->'{x}'" for x in spec['arr'].split('.')[1:])
        frm = f"from private.j_arr(v{path}) with ordinality as x(e, ord)"
        body += insert_sql(spec, frm, 'e')
        for ch in spec.get('children', []):
            cpath = "".join(f"->'{x}'" for x in ch['field'].split('.'))
            frm2 = f"from private.j_arr(v{path}) as x(e), private.j_arr(e{cpath}) with ordinality as y(c, ord)"
            body += insert_sql_child(ch, frm2, 'c', parent_id_expr=f"private.j_text(e->'{spec['key']}')")
    s += "\n".join("      " + l for l in body.strip().split("\n")) + "\n"
    s += "    end if;\n  end if;\n"
    return s

def insert_sql_child(ch, frm, elem, parent_id_expr):
    cols = colnames(ch); t = ch['table']
    names = ['source_path'] + (['network_id'] if ch.get('net') else []) + [ch['parent']]
    vals = ['p'] + (['net_id'] if ch.get('net') else []) + [parent_id_expr]
    if ch.get('key'): names.append('id'); vals.append(f"private.j_text({elem}->'{ch['key']}')")
    else: names.append('line_no'); vals.append('ord::integer')
    for k, ty, c in cols: names.append(c); vals.append(val(elem, k, ty))
    keyset = [ch['key']] if ch.get('key') else []
    names.append('extra'); vals.append(f"nullif(case when jsonb_typeof({elem}) = 'object' then {elem} - {mapped_keys(ch, keyset)} else jsonb_build_object('value', {elem}) end, '{{}}'::jsonb)")
    return f"insert into public.{q(t)} ({', '.join(q(n) for n in names)})\n  select {', '.join(vals)}\n  {frm};\n"

def child_table_sql(ch, net):
    spec = dict(ch, net=net)
    t = spec['table']; lines = [f"create table public.{q(t)} (", "  row_id bigint generated always as identity primary key,", "  source_path text not null,"]
    if net: lines.append("  network_id text not null,")
    lines.append(f"  {q(spec['parent'])} text,")
    lines.append("  id text," if spec.get('key') else "  line_no integer not null,")
    for k, ty, c in colnames(spec): lines.append(f"  {q(c)} {PGT[ty]},")
    lines += ["  extra jsonb,", "  synced_at timestamptz not null default now()", ");"]
    out = "\n".join(lines) + "\n"
    out += f"comment on table public.{q(t)} is {sqlstr(spec['comment'] + ' Kept in step with the app automatically; read-only.')};\n"
    out += f"create index on public.{q(t)} (source_path);\ncreate index on public.{q(t)} ({q(spec['parent'])});\n"
    if net: out += f"create index on public.{q(t)} (network_id);\n"
    out += f"alter table public.{q(t)} enable row level security;\n"
    out += f"create policy {q('Team members read ' + t.replace('_',' '))} on public.{q(t)} for select to authenticated using ((select private.is_member()));\n"
    out += f"grant select on public.{q(t)} to authenticated;\n"
    return out

HEADER = """-- Typed tables for every kind of record JamsNET saves.
-- GENERATED by supabase/tools/gen_typed_tables.py — edit the generator, not this file.
--
-- The app keeps saving to public.documents. A trigger copies each saved document into the
-- matching typed table(s) below, one column per field, so the data can be queried, filtered,
-- exported and reported on. Typed tables are read-only copies: change data in the app.
-- Fields that aren't listed as columns are kept in each row's "extra" column, so nothing is lost.
-- If a document can't be copied, the app's save still succeeds and the problem is logged in
-- private.sync_errors.

-- conversion helpers: never raise, return null when a value doesn't fit the column
create or replace function private.j_text(v jsonb) returns text language sql immutable set search_path = '' as $$
  select case when v is null or jsonb_typeof(v) = 'null' then null when jsonb_typeof(v) = 'string' then v #>> '{}' else v::text end $$;
create or replace function private.j_num(v jsonb) returns numeric language plpgsql immutable set search_path = '' as $$
begin
  if v is null or jsonb_typeof(v) = 'null' then return null; end if;
  if jsonb_typeof(v) = 'number' then return (v #>> '{}')::numeric; end if;
  if jsonb_typeof(v) = 'string' and btrim(v #>> '{}') ~ '^-?[0-9]+(\\.[0-9]+)?$' then return btrim(v #>> '{}')::numeric; end if;
  return null;
exception when others then return null;
end $$;
create or replace function private.j_bool(v jsonb) returns boolean language sql immutable set search_path = '' as $$
  select case when v is null then null when jsonb_typeof(v) = 'boolean' then (v #>> '{}')::boolean
              when lower(v #>> '{}') in ('true','yes','y','1','on') then true
              when lower(v #>> '{}') in ('false','no','n','0','off') then false else null end $$;
create or replace function private.j_date(v jsonb) returns date language plpgsql immutable set search_path = '' as $$
begin
  if v is null or jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then return null; end if;
  return left(v #>> '{}', 10)::date;
exception when others then return null;
end $$;
create or replace function private.j_ts(v jsonb) returns timestamptz language plpgsql immutable set search_path = '' as $$
begin
  if v is null or jsonb_typeof(v) = 'null' then return null; end if;
  if jsonb_typeof(v) = 'number' then return to_timestamp((v #>> '{}')::double precision / 1000); end if;
  if jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then return (v #>> '{}')::timestamptz; end if;
  return null;
exception when others then return null;
end $$;
create or replace function private.j_arr(v jsonb) returns setof jsonb language sql immutable set search_path = '' as $$
  select x from jsonb_array_elements(case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end) as t(x) $$;
-- the app stores some documents as {"json": "<text>"}; this returns the real JSON either way
create or replace function private.doc_value(d jsonb) returns jsonb language plpgsql immutable set search_path = '' as $$
begin
  if d ? 'json' and jsonb_typeof(d -> 'json') = 'string' then return (d ->> 'json')::jsonb; end if;
  return d;
exception when others then return null;
end $$;

create table if not exists private.sync_errors (
  id bigint generated always as identity primary key,
  path text, message text, at timestamptz not null default now()
);

"""

def generate(specs):
    out = HEADER
    for s in specs:
        out += f"\n-- {s['table']}\n"
        tsql, _ = table_sql(s)
        out += tsql
        for ch in s.get('children', []):
            out += f"\n-- {ch['table']}\n" + child_table_sql(ch, s.get('net'))
    out += "\n-- copy one saved document into its typed tables (d is null when the document was deleted)\n"
    out += "create or replace function private.sync_document(p text, d jsonb)\nreturns void language plpgsql security definer set search_path = '' as $$\n"
    out += "declare v jsonb := private.doc_value(d); doc_id text := split_part(p, '/', array_length(string_to_array(p, '/'), 1)); net_id text; matched boolean := false;\nbegin\n"
    for s in specs: out += handler(s)
    out += "exception when others then\n  insert into private.sync_errors (path, message) values (p, sqlerrm);\nend $$;\n"
    out += "revoke all on function private.sync_document(text, jsonb) from public;\n\n"
    out += """create or replace function private.on_document_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform private.sync_document(old.path, null);
  else
    if tg_op = 'UPDATE' and old.path <> new.path then perform private.sync_document(old.path, null); end if;
    perform private.sync_document(new.path, new.data);
  end if;
  return null;
end $$;
revoke all on function private.on_document_change() from public;

create trigger documents_sync_typed_tables
  after insert or update or delete on public.documents
  for each row execute function private.on_document_change();

-- copy anything already saved
select private.sync_document(path, data) from public.documents;
"""
    return out

def generate_compact(specs):
    """The engine (supabase/tools/engine.sql) plus one row per table; the database builds the tables itself."""
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    rows = []
    def row(sp, parent=None, parent_spec=None):
        cols = [[k, ty, c] for k, ty, c in colnames(sp)]
        arr = None if sp.get('arr') is None else [x for x in sp['arr'].split('.')[1:]]
        rows.append(dict(name=sp['table'], parent=parent, doc_regex=(parent_spec or sp)['doc'], arr_path=arr,
                         child_path=sp['field'].split('.') if parent else None, key=sp.get('key'), parent_col=sp.get('parent'),
                         net=bool((parent_spec or sp).get('net')), admin_only=bool((parent_spec or sp).get('admin')), comment=sp['comment'], cols=cols))
    for sp in specs:
        row(sp)
        for ch in sp.get('children', []): row(ch, sp['table'], sp)
    data = json.dumps(rows, separators=(',', ':'), ensure_ascii=False)
    out = open(os.path.join(here, 'engine.sql')).read()
    out += "\n-- the tables (generated from supabase/tools/gen_typed_tables.py)\n"
    out += "insert into private.typed_tables (name, parent, doc_regex, arr_path, child_path, key, parent_col, net, admin_only, comment, cols)\n"
    out += "select name, parent, doc_regex, arr_path, child_path, key, parent_col, net, admin_only, comment, cols\n"
    out += "from jsonb_to_recordset($json$" + data + "$json$::jsonb)\n"
    out += "  as t(name text, parent text, doc_regex text, arr_path text[], child_path text[], key text, parent_col text, net boolean, admin_only boolean, comment text, cols jsonb);\n\n"
    out += "select private.build_typed_tables();\n-- copy anything already saved\nselect private.sync_document(path, data) from public.documents;\n"
    return out

if __name__ == '__main__':
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    html = open(os.path.join(here, '..', '..', 'web', 'jamsnet', 'index.html')).read()
    html = html[html.index('id="nlsrc"'):]
    store = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else {}
    specs = build(store, load_schema(html))
    json.dump([{k: v for k, v in s.items()} for s in specs], open(os.path.join(here, 'typed-tables.spec.json'), 'w'), indent=1)
    sys.stdout.write(generate_compact(specs))
