# Auth email templates

Copies of the emails set in Supabase → Authentication → Emails → Templates.

| File | Supabase template | Subject |
|---|---|---|
| `confirm-signup.html` | Confirm sign up | Confirm your SITREP account |

The confirm link uses `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`, which the app's `/auth/confirm` route verifies. It works on any device, unlike the default PKCE link, which only works in the browser the person signed up in. The logo loads from `https://app.jamsdocsanddesigns.com/logo.png`.
