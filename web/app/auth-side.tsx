/* eslint-disable @next/next/no-img-element */
export default function AuthSide() {
  return (
    <aside className="auth-side">
      <div className="mark">
        <img src="/logo.png" alt="" />
        <div>
          <b>Netline</b>
          <div style={{ fontSize: 13, color: "#8FA6A8" }}>Jams Docs and Designs</div>
        </div>
      </div>
      <h1>Design it, install it, document it, support it.</h1>
      <ul>
        <li>AV drawings, proposals and projects</li>
        <li>Service contracts, time and invoices</li>
        <li>Every network, rack, cable and jack</li>
      </ul>
    </aside>
  );
}
