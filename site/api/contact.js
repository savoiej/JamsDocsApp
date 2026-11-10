// Website request form → email to info@jamsdocsanddesigns.com via Resend.
// Needs the RESEND_API_KEY environment variable in the Vercel project.
const TO = 'info@jamsdocsanddesigns.com';
const FROM = 'Jams Docs and Designs Website <info@jamsdocsanddesigns.com>';
const NEEDS = ['AV system design', 'Smart home design', 'Cable and rack labeling', 'Rack elevations and cable schedules', 'Network documentation', 'Proposals and BOMs',
  'Install support', 'On-site support, moves, adds and changes', 'Service contract', 'As-built documentation', 'Platform early access'];

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Use POST.' }); }
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }

  // spam trap: real people never fill the hidden "website" field
  if (clip(b.website, 200)) return res.status(200).json({ ok: true });

  const name = clip(b.name, 120), email = clip(b.email, 200), company = clip(b.company, 160), phone = clip(b.phone, 40);
  const size = clip(b.size, 60), when = clip(b.when, 60), message = clip(b.message, 5000);
  const needs = (Array.isArray(b.needs) ? b.needs : []).map((x) => clip(x, 80)).filter((x) => NEEDS.includes(x));
  if (!name) return res.status(400).json({ error: 'Add your name so we know who to reply to.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Add an email address we can reply to, like you@company.com.' });

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(500).json({ error: 'The form is not set up yet. Please try again later.' });

  const rows = [['Name', name], ['Company', company || '—'], ['Email', email], ['Phone', phone || '—'],
    ['Needs', needs.length ? needs.join(', ') : 'Not sure yet'], ['Size of the job', size || '—'], ['Timeline', when || '—']];
  const text = 'New project request from jamsdocsanddesigns.com\n\n' + rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
    `\n\nAbout the space:\n${message || '(none)'}\n\nReply to this email to answer ${name} directly.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#14232A;max-width:600px">
<h2 style="margin:0 0 4px">New project request</h2><p style="margin:0 0 16px;color:#55666B">From the form on jamsdocsanddesigns.com</p>
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">${rows.map(([k, v]) =>
    `<tr><td style="color:#55666B;border-bottom:1px solid #E4EAE9;white-space:nowrap">${k}</td><td style="border-bottom:1px solid #E4EAE9"><b>${esc(v)}</b></td></tr>`).join('')}</table>
<h3 style="margin:20px 0 6px;font-size:15px">About the space</h3><p style="white-space:pre-wrap;margin:0;font-size:14px">${esc(message || '(none)')}</p>
<p style="margin:20px 0 0;color:#55666B;font-size:13px">Reply to this email to answer ${esc(name)} directly.</p></div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [TO], reply_to: email, subject: `Project request: ${name}${company ? ' · ' + company : ''}`, text, html }),
    });
    if (!r.ok) { console.error('resend', r.status, await r.text()); return res.status(502).json({ error: 'We couldn’t send your request just now. Please try again in a few minutes.' }); }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('resend', e);
    return res.status(502).json({ error: 'We couldn’t send your request just now. Please try again in a few minutes.' });
  }
};
