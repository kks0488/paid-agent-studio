"use client";

import { useEffect, useRef, useState } from "react";

const PACKAGES = [
  {
    id: "starter",
    name: "Starter",
    price: 19,
    text: "A product page that does the talking.",
    items: ["Product detail page"],
    number: "01",
  },
  {
    id: "launch",
    name: "Launch",
    price: 39,
    text: "Everything for your next little big thing.",
    items: ["Product detail page", "Ad copy + short video script"],
    number: "02",
  },
  {
    id: "growth",
    name: "Growth",
    price: 69,
    text: "More angles. More ways to get noticed.",
    items: ["Everything in Launch", "Thumbnail ideas + listing review"],
    number: "03",
  },
];
const FACTS =
  "100% cotton canvas; 12 L capacity; inner pocket; adjustable strap; sand color; hand wash only.";
const money = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(value || 0),
  );
const statusText = (value) =>
  ({
    quoted: "Quote ready",
    awaiting_payment: "Awaiting payment",
    paid: "Payment confirmed",
    generating: "In the studio",
    delivered: "Delivered",
    refunded: "Refunded",
    refund_pending: "Refund pending",
    refund_failed: "Refund needs attention",
  })[value] || value;

function Icon({ name, size = 20, ...props }) {
  const paths = {
    studio: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <path d="M14 17.5h7M17.5 14v7" />
      </>
    ),
    ledger: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h4" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    sparkle: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
        <path d="m20 2 .5 1.5L22 4l-1.5.5L20 6l-.5-1.5L18 4l1.5-.5L20 2Z" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    code: (
      <>
        <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.sparkle}
    </svg>
  );
}

function Mark({ small = false }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

function ToteArt() {
  return (
    <svg
      className="tote-art"
      viewBox="0 0 380 275"
      role="img"
      aria-label="Original illustration of a sand-colored canvas tote bag"
    >
      <defs>
        <linearGradient id="bag" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#e6d6b8" />
          <stop offset="1" stopColor="#bba887" />
        </linearGradient>
        <linearGradient id="side" x1="0" x2="1">
          <stop stopColor="#a18d6e" />
          <stop offset="1" stopColor="#d2be9b" />
        </linearGradient>
        <filter id="shadow">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <pattern id="canvas" width="4" height="4" patternUnits="userSpaceOnUse">
          <path
            d="M0 0h4M0 2h4"
            stroke="#5c503a"
            strokeWidth=".35"
            opacity=".14"
          />
        </pattern>
      </defs>
      <circle cx="195" cy="134" r="107" fill="#d5fa56" />
      <path d="M54 227h275" stroke="#a2ac8b" opacity=".3" />
      <ellipse
        cx="202"
        cy="232"
        rx="89"
        ry="10"
        fill="#0d1614"
        opacity=".35"
        filter="url(#shadow)"
      />
      <g transform="rotate(-8 190 147)">
        <path
          d="M146 103c-3-76 80-81 78 1"
          fill="none"
          stroke="#948363"
          strokeWidth="16"
        />
        <path
          d="M146 103c-3-76 80-81 78 1"
          fill="none"
          stroke="#d6c6a9"
          strokeWidth="10"
        />
        <path d="M121 93 252 104l13 120-130 7-24-16Z" fill="url(#bag)" />
        <path d="m121 93-10 122 24 16 5-129Z" fill="url(#side)" />
        <path
          d="m121 93 19 9 112 2"
          fill="none"
          stroke="#998668"
          strokeWidth="3"
        />
        <path d="m140 102-5 129 130-7-13-120Z" fill="url(#canvas)" />
        <path
          d="M159 115v97m75-90 8 89"
          stroke="#9c896a"
          strokeWidth="1.5"
          strokeDasharray="2 3"
          opacity=".6"
        />
        <path d="m174 145 41 3-1 32-40-1Z" fill="#dccaab" stroke="#baa483" />
        <path d="m175 148 38 3" stroke="#ae9877" />
        <text
          x="182"
          y="168"
          fontFamily="Arial,sans-serif"
          fontSize="8"
          letterSpacing="2"
          fill="#71634c"
        >
          forma
        </text>
      </g>
      <path d="m302 74 4 11 11 4-11 4-4 11-4-11-11-4 11-4Z" fill="#d5fa56" />
      <path d="m80 149 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#d5fa56" />
    </svg>
  );
}

const RECEIPTS = "paid-agent-studio-receipts-v2";
function savedJobs() {
  try { return JSON.parse(localStorage.getItem(RECEIPTS) || "[]"); } catch { return []; }
}
function remember(order) {
  if (!order?.jobToken) return;
  const jobs = [order, ...savedJobs().filter(job => job.id !== order.id)].slice(0,20);
  localStorage.setItem(RECEIPTS, JSON.stringify(jobs));
}
async function api(path, options = {}) {
  const id = path.match(/\/orders\/([^/?]+)/)?.[1];
  const token = id && savedJobs().find(job => job.id === id)?.jobToken;
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { "x-job-token": token } : {}), ...options.headers },
    cache: "no-store",
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error("The studio could not read the server response. Please try again."); }
  if (!response.ok) throw new Error(result.error?.message || result.error || "Please try again.");
  if (result.order) remember(result.order);
  for (const order of result.orders || []) remember(order);
  return result;
}
async function ledger() {
  const tokens = savedJobs().map(job => job.jobToken);
  if (!tokens.length) return { orders: [] };
  const result = await api("/api/ledger", { method: "POST", body: JSON.stringify({ tokens }) });
  localStorage.setItem(RECEIPTS, JSON.stringify(result.orders || []));
  return result;
}
async function downloadFile(order, format) {
  const response = await fetch(`/api/orders/${order.id}/download?format=${format}`, { headers: { "x-job-token": order.jobToken } });
  if (!response.ok) throw new Error("Download could not be verified. Refresh the ledger and retry.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a"); link.href = url; link.download = `paid-agent-${order.id}.${format === "json" ? "json" : "md"}`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PayPalButtons({ clientId, createOrder, approve, onError }) {
  const target = useRef(null);
  const actions = useRef({ createOrder, approve, onError });
  actions.current = { createOrder, approve, onError };
  useEffect(() => {
    let buttons,
      cancelled = false;
    async function mount() {
      try {
        if (!window.paypal)
          await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`;
            script.onload = resolve;
            script.onerror = () =>
              reject(
                new Error(
                  "Could not load PayPal checkout. Please check your connection and retry.",
                ),
              );
            document.head.appendChild(script);
          });
        if (cancelled || !target.current) return;
        buttons = window.paypal.Buttons({
          style: { layout: "vertical", shape: "rect", label: "pay" },
          createOrder: () => actions.current.createOrder(),
          onApprove: (data) => actions.current.approve(data.orderID),
          onError: (error) => actions.current.onError(error),
          onCancel: () =>
            actions.current.onError(
              new Error(
                "Checkout cancelled. Your quote is still here when you are ready.",
              ),
            ),
        });
        await buttons.render(target.current);
      } catch (error) {
        actions.current.onError(error);
      }
    }
    mount();
    return () => {
      cancelled = true;
      buttons?.close();
    };
  }, [clientId]);
  return <div className="paypal-buttons" ref={target} />;
}

function BundlePreview({ bundle, tab }) {
  if (!bundle) return null;
  if (tab === "ads")
    return (
      <div className="copy-preview">
        <span className="eyebrow">AD COPY</span>
        {bundle.ads?.headlines?.map((v, i) => (
          <h3 key={i}>{v}</h3>
        ))}
        {bundle.ads?.bodies?.map((v, i) => (
          <p key={i}>{v}</p>
        ))}
        <div className="tag-row">
          {bundle.ads?.keywords?.map((v, i) => (
            <span className="tag" key={i}>
              {v}
            </span>
          ))}
        </div>
      </div>
    );
  if (tab === "shorts")
    return (
      <div className="copy-preview">
        <span className="eyebrow">SHORT VIDEO SCRIPT</span>
        <h3>{bundle.shorts?.hook}</h3>
        {bundle.shorts?.scenes?.map((v, i) => (
          <div className="script-scene" key={i}>
            <span className="mono">{v.time}</span>
            <div>
              <strong>{v.visual}</strong>
              <p>{v.voiceover}</p>
              <small>On screen: {v.caption}</small>
            </div>
          </div>
        ))}
        <p>
          <strong>{bundle.shorts?.cta}</strong>
        </p>
      </div>
    );
  if (tab === "extras")
    return (
      <div className="copy-preview">
        <span className="eyebrow">THUMBNAIL IDEAS</span>
        {bundle.thumbnails?.map((v, i) => (
          <p key={i}>
            <strong>{v.text}</strong>
            <br />
            {v.angle}
          </p>
        ))}
        <span className="eyebrow">LISTING REVIEW</span>
        {bundle.listingCheck?.map((v, i) => (
          <p key={i}>
            <strong>{v.issue}</strong>
            <br />
            {v.fix}
          </p>
        ))}
      </div>
    );
  return (
    <div className="copy-preview">
      <span className="eyebrow">PRODUCT DETAIL PAGE</span>
      <h3>{bundle.pdp?.headline}</h3>
      <p className="copy-subtitle">{bundle.pdp?.subheadline}</p>
      <ul>
        {bundle.pdp?.bullets?.map((v, i) => (
          <li key={i}>{v}</li>
        ))}
      </ul>
      {bundle.pdp?.description?.map((v, i) => (
        <p key={i}>{v}</p>
      ))}
      {bundle.pdp?.faq?.map((v, i) => (
        <details key={i}>
          <summary>{v.question}</summary>
          <p>{v.answer}</p>
        </details>
      ))}
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState("studio");
  const [config, setConfig] = useState(null);
  const [orders, setOrders] = useState([]);
  const [order, setOrder] = useState(null);
  const [productName, setProductName] = useState("Forma everyday tote");
  const [facts, setFacts] = useState(FACTS);
  const [packageId, setPackageId] = useState("launch");
  const [guarantee, setGuarantee] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [checkout, setCheckout] = useState(false);
  const [tab, setTab] = useState("pdp");
  const [chat, setChat] = useState("");
  const [chatReply, setChatReply] = useState("");
  const resultRef = useRef(null);
  const selectedPackage = PACKAGES.find((p) => p.id === packageId);
  const activePackage = PACKAGES.find((p) => p.id === order?.packageId);
  const simulated = config?.paymentMode !== "sandbox";
  async function refreshOrders() {
    const data = await ledger();
    setOrders(data.orders || []);
  }
  useEffect(() => {
    Promise.all([api("/api/config").then(settings => { setConfig(settings); return settings; }), ledger()])
      .then(([settings, data]) => {
        setConfig(settings);
        setOrders(data.orders || []);
        const query = new URLSearchParams(window.location.search);
        const returning = data.orders?.find(job => job.id === query.get("checkout"));
        if (returning && query.get("token")) {
          setOrder(returning);
          run("Confirming Sandbox checkout", async () => {
            const paid = await api(`/api/orders/${returning.id}/capture`, {method: "POST", body: JSON.stringify({paypalOrderId: query.get("token")})});
            await updateOrder(paid.order);
            history.replaceState({}, "", "/");
          });
        }
      })
      .catch((err) => setError(err.message));
  }, []);
  async function run(label, work) {
    setBusy(label);
    setError("");
    try {
      await work();
    } catch (err) {
      setError(err.message || "Please try again.");
    } finally {
      setBusy("");
    }
  }
  async function updateOrder(next) {
    setOrder(next);
    await refreshOrders();
  }
  async function makeQuote(event) {
    event.preventDefault();
    await run("Scoping your project", async () => {
      const data = await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          productName,
          facts,
          packageId,
          scenario: guarantee ? "guarantee" : "standard",
        }),
      });
      setCheckout(false);
      setTab("pdp");
      await updateOrder(data.order);
      setTimeout(
        () =>
          resultRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          }),
        100,
      );
    });
  }
  async function createCheckout() {
    const data = await api(`/api/orders/${order.id}/checkout`, {
      method: "POST",
      body: "{}",
    });
    await updateOrder(data.order);
    return data.id;
  }
  async function capture(paypalOrderId, autoFulfill = false) {
    await run("Confirming payment", async () => {
      const data = await api(`/api/orders/${order.id}/capture`, {
        method: "POST",
        body: JSON.stringify({ paypalOrderId }),
      });
      setCheckout(false);
      await updateOrder(data.order);
      if (autoFulfill && data.order.status === "paid") {
        setBusy("Creating and checking your content");
        const fulfilled = await api(`/api/orders/${order.id}/fulfill`, {
          method: "POST",
          body: "{}",
        });
        await updateOrder(fulfilled.order);
      }
    });
  }
  async function fulfill() {
    await run("Creating and checking your content", async () => {
      const data = await api(`/api/orders/${order.id}/fulfill`, {
        method: "POST",
        body: "{}",
      });
      await updateOrder(data.order);
    });
  }
  function askAgent(event) {
    event.preventDefault();
    if (!chat.trim()) return;
    setChatReply(
      `For “${productName || "your product"}”, ${selectedPackage.name} includes ${selectedPackage.items.join(" and ").toLowerCase()} for ${money(selectedPackage.price)}. Add any new product facts to your brief below. The studio checks the draft against those facts before delivery.`,
    );
    setChat("");
  }
  const totalCaptured = orders.reduce(
    (n, o) => n + Number(o.capturedAmount || 0),
    0,
  );
  const totalRefunded = orders.reduce(
    (n, o) => n + Number(o.refundedAmount || 0),
    0,
  );
  const delivered = orders.filter((o) => o.status === "delivered").length;
  const done = ["delivered", "refunded"].includes(order?.status);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Paid Agent Studio home">
          <Mark />
          <span>
            paid agent<span className="brand-second">studio.</span>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            ["studio", "Studio", "studio"],
            ["ledger", "Order ledger", "ledger"],
            ["how", "How it works", "info"],
          ].map(([id, label, icon]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              onClick={() => setView(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {id === "studio" && <span className="nav-dot" />}
              {id === "ledger" && orders.length > 0 && (
                <span className="nav-count">{orders.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="guarantee-mini">
            <Icon name="shield" size={24} />
            <h3>
              Good work.
              <br />
              Or your money back.
            </h3>
            <p>Two failed quality checks trigger an automatic refund.</p>
            <button onClick={() => setView("how")}>
              Meet the guarantee <Icon name="arrow" size={15} />
            </button>
          </div>
          <div className="profile">
            <div className="avatar">Y</div>
            <div>
              <strong>Your workspace</strong>
              <span>Independent seller</span>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {view === "ledger"
                ? "Order ledger"
                : view === "how"
                  ? "How it works"
                  : "Studio"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className={`mode-badge ${!simulated ? "sandbox" : ""}`}>
              <span />
              {!config
                ? "Connecting"
                : simulated
                  ? "Simulation mode"
                  : "PayPal Sandbox"}
            </span>
            <span className="topbar-note">
              {simulated ? "No real money moves" : "Test payments only"}
            </span>
            <div className="top-avatar">Y</div>
          </div>
        </header>
        <main>
          {view === "studio" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="tiny-spark">✳</span> YOUR LAUNCH, ON THE
                    HOUSE TEAM
                  </div>
                  <h1>
                    Your next launch,
                    <br />
                    <span>handled.</span>
                  </h1>
                  <p>
                    Meet the agent that quotes, creates, and stands behind its
                    work.
                    <br className="desktop-break" /> Bring a product. Leave with
                    your next launch.
                  </p>
                </div>
                <div className="heading-note">
                  <span className="drawn-arrow">↙</span>
                  <span>
                    A little less busywork.
                    <br />A lot more possibility.
                  </span>
                </div>
              </div>

              <div className="studio-grid">
                <div className="main-column">
                  <section className="agent-greeting">
                    <div className="agent-avatar">
                      <Mark small />
                    </div>
                    <div>
                      <div className="agent-name">
                        Studio Agent <span className="online-dot" />
                        <span>Ready when you are</span>
                      </div>
                      <p>
                        Hey, let’s make something worth launching. Tell me about
                        your product, choose a package, and I’ll take it from
                        there.
                      </p>
                    </div>
                  </section>
                  <form onSubmit={makeQuote} className="brief-panel panel">
                    <div className="section-heading">
                      <div>
                        <span className="step-number">01</span>
                        <h2>The starting point</h2>
                      </div>
                      <span className="muted">A few facts. A fresh start.</span>
                    </div>
                    <label htmlFor="product-name">What are we launching?</label>
                    <input
                      id="product-name"
                      name="productName"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      required
                      maxLength={120}
                      placeholder="Your product name"
                    />
                    <div className="label-row">
                      <label htmlFor="product-facts">Just the facts</label>
                      <span>No perfect brief needed</span>
                    </div>
                    <textarea
                      id="product-facts"
                      name="facts"
                      value={facts}
                      onChange={(e) => setFacts(e.target.value)}
                      required
                      maxLength={6000}
                      rows={3}
                      placeholder="Materials, features, dimensions, care instructions…"
                    />
                    <div className="field-note">
                      <Icon name="shield" size={14} /> Your facts are the source
                      of truth. We don’t invent product claims.
                    </div>
                    <div className="package-label">
                      <label>Choose your launchpad</label>
                      <span>ONE-TIME PRICING · USD</span>
                    </div>
                    <div
                      className="package-grid"
                      role="radiogroup"
                      aria-label="Content package"
                      onKeyDown={(event) => {
                        if (
                          [
                            "ArrowLeft",
                            "ArrowRight",
                            "ArrowUp",
                            "ArrowDown",
                          ].includes(event.key)
                        ) {
                          event.preventDefault();
                          const offset = ["ArrowLeft", "ArrowUp"].includes(
                            event.key,
                          )
                            ? -1
                            : 1;
                          const next =
                            (PACKAGES.findIndex((p) => p.id === packageId) +
                              offset +
                              PACKAGES.length) %
                            PACKAGES.length;
                          setPackageId(PACKAGES[next].id);
                          event.currentTarget.children[next]?.focus();
                        }
                      }}
                    >
                      {PACKAGES.map((p) => (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={packageId === p.id}
                          className={`package ${packageId === p.id ? "selected" : ""}`}
                          key={p.id}
                          onClick={() => setPackageId(p.id)}
                        >
                          <div className="package-top">
                            <span>{p.name}</span>
                            <span className="radio-circle">
                              {packageId === p.id && <span />}
                            </span>
                          </div>
                          <div className="package-price">
                            ${p.price}
                            <span>/ bundle</span>
                          </div>
                          <p>{p.text}</p>
                          <div className="package-divider" />
                          {p.items.map((item) => (
                            <div className="package-feature" key={item}>
                              <Icon name="check" size={13} />
                              <span>{item}</span>
                            </div>
                          ))}
                          {p.id === "launch" && (
                            <span className="popular">THE SWEET SPOT</span>
                          )}
                        </button>
                      ))}
                    </div>
                    {(
                      <label className="test-toggle">
                        <input
                          type="checkbox"
                          checked={guarantee}
                          onChange={(e) => setGuarantee(e.target.checked)}
                        />
                        <span className="toggle-track" />
                        <span>
                          Try the refund guarantee{" "}
                          <small>{simulated ? "Two failed checks · simulated refund" : "Two failed checks · full Sandbox refund"}</small>
                        </span>
                        <span className="test-label">TEST</span>
                      </label>
                    )}
                    <div className="brief-footer">
                      <span>
                        <Icon name="clock" size={15} /> Fixed price. No
                        subscription.
                      </span>
                      <button
                        className="primary-button"
                        disabled={!!busy || !config}
                        type="submit"
                      >
                        {busy === "Scoping your project"
                          ? "Scoping your project…"
                          : "Get my quote"}
                        <Icon name="arrow" size={18} />
                      </button>
                    </div>
                  </form>
                  {error && (
                    <div className="error-box" role="alert">
                      <Icon name="info" />
                      <div>
                        <strong>The studio needs a moment</strong>
                        <p>{error}</p>
                        {!config && (
                          <button
                            className="secondary-button"
                            disabled={!!busy}
                            onClick={() =>
                              run("Reconnecting studio", async () => {
                                setConfig(await api("/api/config"));
                                await refreshOrders();
                              })
                            }
                          >
                            Reconnect studio
                          </button>
                        )}
                      </div>
                      <button
                        aria-label="Dismiss error"
                        onClick={() => setError("")}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {order && (
                    <section
                      className="result-panel panel"
                      ref={resultRef}
                      aria-live="polite"
                    >
                      <div className="section-heading">
                        <div>
                          <span className="step-number">02</span>
                          <h2>
                            {done
                              ? order.status === "delivered"
                                ? "Ready for your next chapter"
                                : "Our guarantee, in action"
                              : "Your project, in motion"}
                          </h2>
                        </div>
                        <span className={`status-pill ${order.status}`}>
                          {statusText(order.status)}
                        </span>
                      </div>
                      <div className="quote-heading">
                        <div>
                          <span className="eyebrow">
                            {activePackage?.name || order.packageId} BUNDLE
                          </span>
                          <h3>{order.productName}</h3>
                        </div>
                        <span className="quote-amount">
                          {money(order.amount)}
                          <small>USD · one time</small>
                        </span>
                      </div>
                      <p className="quote-explanation">
                        {order.quoteExplanation}
                      </p>
                      <p className="quote-explanation" role="status">
                        {order.aiNotice || (order.quoteMode === "live" ? "Live AI quote explanation · fixed server price." : "Deterministic package explanation.")}
                        {order.status === "delivered" && (order.aiMode === "live" ? " Live AI content delivered." : " Demo fixture content delivered.")}
                      </p>
                      {["quoted", "awaiting_payment"].includes(
                        order.status,
                      ) && (
                        <>
                          <div className="payment-promise">
                            <Icon name="shield" size={18} />
                            <span>
                              Pay first. We create, check, then deliver. Two
                              failed quality checks? We refund your payment.
                            </span>
                          </div>
                          {!simulated && !config?.liveReady && (
                            <p className="setup-note" role="status">
                              Sandbox checkout needs signed job tokens and a
                              verified PayPal webhook. The workspace owner must
                              finish this setup before accepting a test payment.
                            </p>
                          )}
                          {!checkout ? (
                            <button
                              className="primary-button wide"
                              disabled={
                                !!busy || (!simulated && !config?.liveReady)
                              }
                              onClick={() =>
                                run("Opening checkout", async () => {
                                  if (simulated) await createCheckout();
                                  setCheckout(true);
                                })
                              }
                            >
                              {" "}
                              {busy === "Opening checkout"
                                ? "Preparing checkout…"
                                : simulated
                                  ? "Continue to simulated checkout"
                                  : "Continue to PayPal Sandbox"}{" "}
                              <Icon name="arrow" size={17} />
                            </button>
                          ) : (
                            <div className="checkout-box">
                              <span className="eyebrow">
                                {simulated
                                  ? "SIMULATED CHECKOUT"
                                  : "PAYPAL SANDBOX CHECKOUT"}
                              </span>
                              <h3>
                                {money(order.amount)} to get your launch moving.
                              </h3>
                              <p>
                                {simulated
                                  ? "This is a demo payment. No account, card, or real money is used."
                                  : "Use a PayPal Sandbox buyer account. This is a test payment."}
                              </p>
                              {simulated ? (
                                <button
                                  className="primary-button wide"
                                  disabled={!!busy}
                                  onClick={() => capture(order.paypalOrderId)}
                                >
                                  {busy
                                    ? "Confirming payment…"
                                    : `Simulate ${money(order.amount)} payment`}
                                  <Icon name="arrow" size={17} />
                                </button>
                              ) : (
                                <>
                                <PayPalButtons
                                  clientId={config.paypalClientId}
                                  createOrder={createCheckout}
                                  approve={(id) => capture(id, true)}
                                  onError={(err) =>
                                    setError(
                                      err.message ||
                                        "PayPal checkout failed. Please retry.",
                                    )
                                  }
                                />
                                <button className="secondary-button wide" disabled={!!busy} onClick={() => run("Opening Sandbox guest checkout", async () => {
                                  const checkout = await api(`/api/orders/${order.id}/checkout`, {method: "POST", body: "{}"});
                                  if (!checkout.approvalUrl || new URL(checkout.approvalUrl).hostname !== "www.sandbox.paypal.com") throw new Error("Sandbox checkout URL unavailable.");
                                  window.location.assign(checkout.approvalUrl);
                                })}>
                                  Sandbox guest card checkout
                                </button>
                                <small>Use PayPal's Sandbox test card. No real money moves.</small>
                                </>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      {order.status === "generating" && !busy && (
                        <div className="recovery-state">
                          <h3>Your project is still in the studio.</h3>
                          <p>
                            The last request was interrupted. Resume from the
                            saved quality checks.
                          </p>
                          <button
                            className="primary-button wide"
                            onClick={fulfill}
                          >
                            Resume content generation
                            <Icon name="arrow" size={17} />
                          </button>
                        </div>
                      )}
                      {order.status === "paid" && (
                        <div className="paid-state">
                          <span className="success-icon">
                            <Icon name="check" />
                          </span>
                          <div>
                            <h3>Payment confirmed. Let’s create.</h3>
                            <p>
                              Your {simulated ? "simulated " : "Sandbox "}
                              payment of {money(order.capturedAmount)} is
                              recorded. The agent will draft your content and
                              run its checks.
                            </p>
                          </div>
                          <button
                            className="primary-button wide"
                            disabled={!!busy}
                            onClick={fulfill}
                          >
                            {busy
                              ? "Creating and checking…"
                              : "Create my content bundle"}
                            <Icon name="sparkle" size={18} />
                          </button>
                        </div>
                      )}
                      {busy && busy !== "Scoping your project" && (
                        <div className="working-state" role="status">
                          <span className="loading-dot" />
                          {busy}…
                        </div>
                      )}
                      {order.status === "delivered" && (
                        <>
                          <div className="delivery-banner">
                            <Icon name="check" size={18} />
                            <span>
                              Quality checks passed. Your launch bundle is
                              ready.
                            </span>
                          </div>
                          <div
                            className="preview-tabs"
                            role="tablist"
                            aria-label="Bundle preview"
                          >
                            {[
                              ["pdp", "Product page"],
                              ...(order.packageId !== "starter"
                                ? [
                                    ["ads", "Ad copy"],
                                    ["shorts", "Shorts script"],
                                  ]
                                : []),
                              ...(order.packageId === "growth"
                                ? [["extras", "Extras"]]
                                : []),
                            ].map(([id, name]) => (
                              <button
                                key={id}
                                role="tab"
                                aria-selected={tab === id}
                                onClick={() => setTab(id)}
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                          <div role="tabpanel">
                            <BundlePreview bundle={order.bundle} tab={tab} />
                          </div>
                          <div className="download-row">
                            <span>Yours to make your own.</span>
                            <a
                              className="secondary-button"
                              href="#"
                              onClick={(event) => { event.preventDefault(); run("Preparing download", () => downloadFile(order, "markdown")); }}
                              download
                            >
                              <Icon name="download" size={15} /> Markdown
                            </a>
                            <a
                              className="secondary-button"
                              href="#"
                              onClick={(event) => { event.preventDefault(); run("Preparing download", () => downloadFile(order, "json")); }}
                              download
                            >
                              <Icon name="code" size={15} /> JSON
                            </a>
                          </div>
                          <p className="quality-note">
                            Automated checks compare the copy with your supplied
                            facts and scan risky claims. Review content before
                            publishing; this is not fact-check certification.
                          </p>
                        </>
                      )}
                      {["refunded", "refund_pending", "refund_failed"].includes(
                        order.status,
                      ) && (
                        <div className="refund-state">
                          <Icon name="shield" size={30} />
                          <h3>
                            {order.status === "refunded"
                              ? "The work didn’t pass. Your payment came back."
                              : order.status === "refund_pending"
                                ? "Your refund is being processed."
                                : "Your refund needs attention."}
                          </h3>
                          <p>
                            Two drafts failed our quality checks, so no content
                            was delivered.{" "}
                            {order.status === "refunded"
                              ? `${money(order.refundedAmount)} was refunded${simulated ? " in simulation" : " through PayPal Sandbox"}.`
                              : "Your payment and refund status are visible in the order ledger."}
                          </p>
                          {order.qcAttempts?.map((a) => (
                            <div className="qc-attempt" key={a.attempt}>
                              <strong>
                                Check {a.attempt}:{" "}
                                {a.passed ? "passed" : "failed"}
                              </strong>
                              <span>
                                {a.issues
                                  ?.map((issue) =>
                                    typeof issue === "string"
                                      ? issue
                                      : issue.message || JSON.stringify(issue),
                                  )
                                  .join(" · ")}
                              </span>
                            </div>
                          ))}
                          {["refund_failed", "refund_pending"].includes(
                            order.status,
                          ) && (
                            <button
                              className="secondary-button"
                              onClick={fulfill}
                              disabled={!!busy}
                            >
                              {order.status === "refund_pending"
                                ? "Check refund status"
                                : "Retry refund"}
                            </button>
                          )}
                        </div>
                      )}
                      <div className="order-reference">
                        <span className="mono">{order.id}</span>
                        <button onClick={() => setView("ledger")}>
                          View in ledger <Icon name="arrow" size={14} />
                        </button>
                      </div>
                    </section>
                  )}
                  <section className="chat-panel">
                    <span className="eyebrow">A THOUGHT BEFORE WE START?</span>
                    {chatReply && (
                      <p className="chat-reply" role="status">
                        {chatReply}
                      </p>
                    )}
                    <form onSubmit={askAgent}>
                      <input
                        aria-label="Ask the studio about your package"
                        value={chat}
                        onChange={(e) => setChat(e.target.value)}
                        maxLength={1000}
                        placeholder="Ask about your package…"
                      />
                      <button
                        type="submit"
                        aria-label="Send message"
                        disabled={!chat.trim()}
                      >
                        <Icon name="arrow" size={19} />
                      </button>
                    </form>
                    <small>
                      Package guidance is deterministic.{" "}
                      {config?.aiMode === "live"
                        ? "Content generation uses a connected AI provider."
                        : "Demo content uses fixtures; no AI model is called."}
                    </small>
                  </section>
                </div>
                <aside className="insight-column">
                  <section className="product-card">
                    <div className="product-card-top">
                      <span className="eyebrow">
                        SMALL PRODUCT. BIG POSSIBILITIES.
                      </span>
                      <span>↗</span>
                    </div>
                    <ToteArt />
                    <div className="product-card-bottom">
                      <div>
                        <span>FROM A FEW FACTS TO</span>
                        <h3>A launch with legs.</h3>
                      </div>
                      <span className="art-number">01 / 03</span>
                    </div>
                  </section>
                  <section className="workflow-panel panel">
                    <div className="workflow-title">
                      <h2>The work behind the work</h2>
                      <span className="live-pill">
                        <span />
                        {order ? "PROJECT ACTIVITY" : "AGENT WORKFLOW"}
                      </span>
                    </div>
                    <p>
                      Every action has a paper trail.
                      <br />
                      You’re always in the loop.
                    </p>
                    <div className="timeline">
                      {order?.timeline?.length
                        ? order.timeline.map((event, i) => (
                            <div className="timeline-item" key={event.id || i}>
                              <span
                                className={`timeline-icon ${/fail|error/.test(event.status) ? "failed" : "complete"}`}
                              >
                                <Icon
                                  name={
                                    /fail|error/.test(event.status)
                                      ? "info"
                                      : "check"
                                  }
                                  size={12}
                                />
                              </span>
                              <div>
                                <h4>
                                  {event.tool?.replaceAll("_", " ") ||
                                    event.summary}
                                </h4>
                                <p>{event.summary}</p>
                                <span className="tool-endpoint mono">
                                  {event.method} {event.path}
                                </span>
                                <span className="timeline-status">
                                  {event.status}{" "}
                                  {event.at &&
                                    `· ${new Date(event.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`}
                                </span>
                              </div>
                            </div>
                          ))
                        : [
                            [
                              "01",
                              "Scope & quote",
                              "A clear package. A fixed price.",
                              "create_order",
                            ],
                            [
                              "02",
                              "Secure the payment",
                              "Checkout through PayPal.",
                              "capture",
                            ],
                            [
                              "03",
                              "Create & quality check",
                              "Grounded in the facts you provide.",
                              "generate_bundle",
                            ],
                            [
                              "04",
                              "Deliver. Or refund.",
                              "Good work has accountability.",
                              "deliver / refund",
                            ],
                          ].map(([n, title, text, tool]) => (
                            <div className="timeline-item" key={n}>
                              <span className="timeline-icon">{n}</span>
                              <div>
                                <h4>{title}</h4>
                                <p>{text}</p>
                                <span className="tool-name mono">
                                  {tool}
                                  <span>↗</span>
                                </span>
                              </div>
                            </div>
                          ))}
                    </div>
                    <div className="timeline-foot">
                      <Icon name="code" size={14} />
                      <span>
                        {simulated
                          ? "Schema-aligned PayPal simulation"
                          : "PayPal Orders + Payments APIs"}
                      </span>
                    </div>
                  </section>
                  <div className="trust-note">
                    <Icon name="shield" size={19} />
                    <p>
                      Built on trust, not crossed fingers.
                      <br />
                      <span>
                        Server-priced orders. Verified payments.
                        <br />A guarantee the agent can act on.
                      </span>
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}

          {view === "ledger" && (
            <>
              <div className="page-heading compact">
                <div>
                  <div className="eyebrow">
                    A LITTLE ACCOUNTABILITY GOES A LONG WAY
                  </div>
                  <h1>
                    Every order.
                    <br />
                    <span>Out in the open.</span>
                  </h1>
                  <p>
                    Payments, deliveries, and refunds. One honest paper trail.
                  </p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setView("studio")}
                >
                  New project
                  <Icon name="plus" size={17} />
                </button>
              </div>
              <div className="metrics-grid">
                {[
                  ["Projects", orders.length, "Every brief starts here"],
                  [
                    "Captured",
                    money(totalCaptured),
                    simulated ? "Simulated payments" : "Sandbox payments",
                  ],
                  ["Refunded", money(totalRefunded), "The guarantee in action"],
                  ["Delivered", delivered, "Ready for the next launch"],
                ].map(([name, value, subtitle]) => (
                  <div className="metric panel" key={name}>
                    <span>{name}</span>
                    <strong>{value}</strong>
                    <small>{subtitle}</small>
                  </div>
                ))}
              </div>
              <section className="ledger-panel panel">
                <div className="section-heading">
                  <div>
                    <Icon name="ledger" />
                    <h2>Order ledger</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => run("Refreshing ledger", refreshOrders)}
                    disabled={!!busy}
                  >
                    Refresh ↻
                  </button>
                </div>
                {error && (
                  <p className="error-inline" role="alert">
                    {error}
                  </p>
                )}
                {orders.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>PROJECT / ORDER</th>
                          <th>PACKAGE</th>
                          <th>STATUS</th>
                          <th>CAPTURED</th>
                          <th>REFUNDED</th>
                          <th aria-label="View order" />
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.id}>
                            <td>
                              <strong>{o.productName}</strong>
                              <span className="mono">{o.id}</span>
                            </td>
                            <td className="capitalize">
                              {o.packageId}
                              <small>{money(o.amount)}</small>
                            </td>
                            <td>
                              <span className={`status-pill ${o.status}`}>
                                {statusText(o.status)}
                              </span>
                            </td>
                            <td>{money(o.capturedAmount)}</td>
                            <td>{money(o.refundedAmount)}</td>
                            <td>
                              <button
                                className="table-open"
                                aria-label={`Open ${o.productName}`}
                                onClick={() => {
                                  setOrder(o);
                                  setCheckout(false);
                                  setTab("pdp");
                                  setView("studio");
                                  setTimeout(
                                    () =>
                                      resultRef.current?.scrollIntoView({
                                        behavior: "smooth",
                                        block: "start",
                                      }),
                                    100,
                                  );
                                }}
                              >
                                <Icon name="arrow" size={18} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    <Icon name="ledger" size={34} />
                    <h3>Your next launch starts the story.</h3>
                    <p>
                      Create your first quote to see the full order trail here.
                    </p>
                    <button
                      className="primary-button"
                      onClick={() => setView("studio")}
                    >
                      Start a project
                      <Icon name="arrow" size={16} />
                    </button>
                  </div>
                )}
              </section>
              <div className="ledger-disclaimer">
                <Icon name="info" size={16} />
                {simulated
                  ? "This session’s ledger contains simulated transactions only. No real money has moved."
                  : "This session’s ledger contains PayPal Sandbox test transactions."}{" "}
                {config?.storageMode && `Storage: ${config.storageMode}.`}
              </div>
            </>
          )}

          {view === "how" && (
            <>
              <div className="page-heading compact">
                <div>
                  <div className="eyebrow">AN AGENT WITH SKIN IN THE GAME</div>
                  <h1>
                    From a product fact
                    <br />
                    <span>to a finished launch.</span>
                  </h1>
                  <p>
                    One brief. One price. An agent accountable for the result.
                  </p>
                </div>
              </div>
              <div className="how-grid">
                {[
                  [
                    "01",
                    "You bring the facts.",
                    "Tell the studio what your product is made of, what it does, and what makes it yours. Choose a fixed-price package: Starter $19, Launch $39, or Growth $69.",
                  ],
                  [
                    "02",
                    "The agent secures the job.",
                    "The server creates the priced order. PayPal checkout and payment capture confirm the payment before any content is generated. Your browser never sets the price.",
                  ],
                  [
                    "03",
                    "Draft. Check. Check again.",
                    "The studio creates your bundle, compares claims with your brief, and scans for risky language. A failed draft gets one repair attempt. These automated checks support your review; they are not independent fact-check certification.",
                  ],
                  [
                    "04",
                    "Your content. Or your refund.",
                    "A passing bundle is available as Markdown and JSON. If two drafts fail, the agent requests a refund through PayPal. The order ledger shows whether that refund completed, is pending, or needs attention.",
                  ],
                ].map(([n, title, text]) => (
                  <section className="how-card panel" key={n}>
                    <span className="how-number">{n}</span>
                    <h2>{title}</h2>
                    <p>{text}</p>
                  </section>
                ))}
              </div>
              <div className="how-bottom panel">
                <Icon name="code" size={30} />
                <div>
                  <h2>Clear about what’s real.</h2>
                  <p>
                    {simulated
                      ? "This workspace is in simulation mode. PayPal-shaped fixtures show the full payment and refund flow without moving money."
                      : "This workspace uses PayPal Sandbox, with test payments rather than real funds."}{" "}
                    {config?.aiMode === "live"
                      ? "Content generation is connected to a live AI provider."
                      : "AI content comes from deterministic demo fixtures. No model is called."}{" "}
                    Real product facts still matter: review every deliverable
                    before using it.
                  </p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setView("studio")}
                >
                  Give it a go
                  <Icon name="arrow" size={17} />
                </button>
              </div>
            </>
          )}
          <footer className="footer">
            <span>Made for the ones making things.</span>
            <span>
              Paid Agent Studio <span className="footer-star">✳</span>{" "}
              {new Date().getFullYear()}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
