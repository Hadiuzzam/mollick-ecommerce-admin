import React, { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, dbRequest, list, uploadImage } from "./firebase";

const base = "clientDemo";
const defaults = {
  nameBn: "মল্লিক সপ", nameEn: "Mollick Shop",
  heroTitleBn: "", heroTitleEn: "", promoBadge: "Premium COD Shop",
  taglineBn: "বিশ্বাসযোগ্য পণ্য, সুন্দর প্যাকেজিং, সহজ ক্যাশ অন ডেলিভারি।",
  taglineEn: "Trusted goods, polished packaging, simple cash on delivery.",
  primaryColor: "#0f6b45", accentColor: "#c9a45f",
  deliveryCharge: 60, whatsapp: "", email: "", active: true,
  logoUrl: "", heroImageUrl: "",
};
const money = (value) => `${Number(value || 0).toLocaleString("bn-BD")}৳`;

function parsePrice(value) {
  const digits = String(value).trim()
    .replace(/[০-৯]/g, (digit) => "০১২৩৪৫৬৭৮৯".indexOf(digit))
    .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    .replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
    .replace(/[,\s৳]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(digits)) return null;
  const price = Number(digits);
  return price > 0 && price <= 100000 ? price : null;
}

function friendlyError(error) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");
  if (code.startsWith("storage/")) {
    console.error("Image upload failed:", code, error?.customData?.serverResponse || message);
    const reasons = {
      "storage/unauthorized": "ছবি আপলোডের অনুমতি নেই। Storage Rules এবং অ্যাডমিন ইমেইল যাচাই করুন।",
      "storage/unauthenticated": "সাইন ইন শেষ হয়ে গেছে। আবার সাইন ইন করুন।",
      "storage/bucket-not-found": "নির্ধারিত Storage bucket পাওয়া যায়নি।",
      "storage/no-default-bucket": "Storage bucket সেট করা নেই।",
      "storage/quota-exceeded": "Storage-এর সীমা বা বিলিং সেটিংস পরীক্ষা করুন।",
      "storage/retry-limit-exceeded": "ছবি আপলোডে সময় বেশি লেগেছে। সংযোগ দেখে আবার চেষ্টা করুন।",
    };
    return `${reasons[code] || "ছবি আপলোড হয়নি। বিস্তারিত জানতে browser console দেখুন।"} (${code})`;
  }
  if (/Choose a JPG|image\/(jpeg|png|webp)/i.test(message)) return "JPG, PNG বা WebP ছবি নির্বাচন করুন (সর্বোচ্চ ৫ MB)।";
  if (/401|403|permission|unauthorized/i.test(message)) return "সংরক্ষণ করা যায়নি। অ্যাকাউন্ট ও অনুমতি যাচাই করুন।";
  return "সংরক্ষণ করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।";
}

function ImageInput({ name, label, currentUrl, onError }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  useEffect(() => {
    if (!file) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <label className="admin-image-field">{label}
    {(previewUrl || currentUrl) && <img className="admin-image-preview" src={previewUrl || currentUrl} alt="ছবির প্রিভিউ" />}
    <input type="file" name={name} accept="image/jpeg,image/png,image/webp" onChange={(event) => {
      const selected = event.target.files?.[0] || null;
      if (selected && (!["image/jpeg", "image/png", "image/webp"].includes(selected.type) || selected.size > 5 * 1024 * 1024)) {
        event.target.value = "";
        setFile(null);
        onError("JPG, PNG বা WebP ছবি নির্বাচন করুন (সর্বোচ্চ ৫ MB)।");
        return;
      }
      setFile(selected);
    }} />
    {file && <small>{file.name}</small>}
  </label>;
}

function Login({ onError }) {
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const email = String(form.get("email")).trim();
      const password = String(form.get("password"));
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) { onError(error.message); }
    finally { setBusy(false); }
  };
  return <main className="admin-auth"><form className="admin-card" onSubmit={submit}>
    <span className="admin-kicker">MOLLICK COMMERCE</span>
    <h1>Admin sign in</h1>
    <p>প্রতিষ্ঠানের সেটিংস, পণ্য ও অর্ডার পরিচালনা করুন।</p>
    <label>Email<input type="email" name="email" required autoComplete="email" defaultValue="admin@gmail.com" /></label>
    <label>Password<input type="password" name="password" required minLength={6} autoComplete="current-password" /></label>
    <button className="admin-primary" disabled={busy}>{busy ? "Please wait..." : "Sign in"}</button>
  </form></main>;
}

export default function Admin() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState("overview");
  const [settings, setSettings] = useState(defaults);
  const [hasSettings, setHasSettings] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [productFormVersion, setProductFormVersion] = useState(0);
  const [categoryFormVersion, setCategoryFormVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (next) => {
    setUser(next); setAuthReady(true);
  }), []);

  const refresh = useCallback(async (currentUser) => {
    const [savedSettings, savedProducts, savedCategories, savedOrders] = await Promise.all([
      dbRequest(`${base}/settings`, { user: currentUser }),
      dbRequest(`${base}/products`, { user: currentUser }),
      dbRequest(`${base}/categories`, { user: currentUser }),
      dbRequest(`${base}/orders`, { user: currentUser }),
    ]);
    setSettings({ ...defaults, ...(savedSettings || {}) });
    setHasSettings(Boolean(savedSettings));
    setProducts(list(savedProducts));
    setCategories(list(savedCategories));
    setOrders(list(savedOrders).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
  }, []);

  useEffect(() => {
    if (!user) return;
    refresh(user).catch((e) => { setNotice(e.message); setError(true); });
  }, [user, refresh]);

  const run = async (action, success) => {
    setBusy(true); setNotice("সংরক্ষণ হচ্ছে..."); setError(false);
    try {
      await action();
      await refresh(user);
      setNotice(success);
    } catch (e) { setNotice(friendlyError(e)); setError(true); }
    finally { setBusy(false); }
  };

  const saveBrand = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(async () => {
      const logo = form.get("logo");
      const banner = form.get("banner");
      if (logo?.size || banner?.size) setNotice("ছবি আপলোড হচ্ছে...");
      const logoUrl = logo?.size ? await uploadImage(logo, user) : settings.logoUrl;
      const heroImageUrl = banner?.size ? await uploadImage(banner, user) : settings.heroImageUrl;
      const data = {
        nameBn: String(form.get("nameBn")).trim(), nameEn: String(form.get("nameEn")).trim() || String(form.get("nameBn")).trim(),
        heroTitleBn: String(form.get("heroTitleBn")).trim(), heroTitleEn: String(form.get("heroTitleEn")).trim(),
        promoBadge: String(form.get("promoBadge")).trim(),
        taglineBn: String(form.get("taglineBn")).trim(), taglineEn: String(form.get("taglineEn")).trim(),
        whatsapp: String(form.get("whatsapp")).trim(), email: String(form.get("email")).trim(),
        primaryColor: String(form.get("primaryColor")), accentColor: String(form.get("accentColor")),
        deliveryCharge: Number(form.get("deliveryCharge")), active: form.has("active"),
        logoUrl, heroImageUrl,
      };
      await dbRequest(`${base}/settings`, { method: "PUT", data, user });
    }, "দোকানের তথ্য সংরক্ষণ হয়েছে।");
  };

  const saveCategory = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nameBn = String(form.get("bn")).trim();
    if (!nameBn) { setNotice("ক্যাটাগরির বাংলা নাম লিখুন।"); setError(true); return; }
    run(async () => {
      const data = { bn: nameBn, en: String(form.get("en")).trim() || nameBn, tone: String(form.get("tone")) || "#e8f6ee" };
      await dbRequest(editingCategory ? `${base}/categories/${editingCategory.id}` : `${base}/categories`, {
        method: editingCategory ? "PUT" : "POST", data, user,
      });
      setEditingCategory(null);
      setCategoryFormVersion((version) => version + 1);
    }, "ক্যাটাগরি সংরক্ষণ হয়েছে।");
  };

  const saveProduct = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const price = parsePrice(form.get("price"));
    if (price === null) { setNotice("সঠিক দাম লিখুন (১ থেকে ১,০০,০০০ টাকা)। বাংলা বা ইংরেজি সংখ্যা ব্যবহার করতে পারেন।"); setError(true); return; }
    const nameBn = String(form.get("bn")).trim();
    if (!nameBn) { setNotice("পণ্যের বাংলা নাম লিখুন।"); setError(true); return; }
    run(async () => {
      const image = form.get("image");
      if (image?.size) setNotice("ছবি আপলোড হচ্ছে...");
      const imageUrl = image?.size ? await uploadImage(image, user) : (editingProduct?.imageUrl || "");
      setNotice("পণ্য সংরক্ষণ হচ্ছে...");
      await dbRequest(editingProduct ? `${base}/products/${editingProduct.id}` : `${base}/products`, {
        method: editingProduct ? "PUT" : "POST", data: {
        bn: nameBn, en: String(form.get("en")).trim() || nameBn,
        descriptionBn: String(form.get("descriptionBn")).trim(), descriptionEn: String(form.get("descriptionEn")).trim(),
        category: String(form.get("category")) || "uncategorized", price,
        available: form.has("available"), active: form.has("active"), imageUrl,
        updatedAt: new Date().toISOString(),
      }, user });
      setEditingProduct(null);
      setProductFormVersion((version) => version + 1);
    }, "পণ্য সংরক্ষণ হয়েছে। দোকানের ওয়েবসাইটে দেখা যাবে।");
  };

  if (!authReady) return <main className="admin-loading">Loading admin...</main>;
  if (!user) return <><Login onError={(message) => { setNotice(message); setError(true); }} />{notice && <div className="admin-toast error" role="alert">{notice}</div>}</>;

  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-logo">M<span>·</span> <small>Commerce Console</small></div>
      <p className="admin-kicker">দোকান পরিচালনা</p>
      <nav className="admin-nav">
        {[["overview", "Dashboard"], ["brand", "Store Settings"], ["products", "Products"], ["categories", "Categories"], ["orders", "Orders"]].map(([key, label]) =>
          <button key={key} className={tab === key ? "selected" : ""} onClick={() => setTab(key)}>{label}</button>)}
      </nav>
      <div className="admin-sidebar-foot"><small>{user.email}</small><button onClick={() => signOut(auth)}>Sign out</button><a href={import.meta.env.VITE_PUBLIC_SITE_URL || (import.meta.env.PROD ? "https://hadiuzzam.github.io/mollick-ecommerce-public/" : `${window.location.protocol}//${window.location.hostname}:5173/`)} target="_blank" rel="noreferrer">View storefront ↗</a></div>
    </aside>
    <main className="admin-main">
      <header className="admin-heading"><div><p className="admin-kicker">MOLLICK COMMERCE</p><h1>{settings.nameBn}</h1><p>আপনার দোকান এখান থেকে পরিচালনা করুন</p></div><button className="admin-outline" disabled={busy} onClick={() => run(() => Promise.resolve(), "সর্বশেষ তথ্য দেখা যাচ্ছে।")}>তথ্য রিফ্রেশ</button></header>
      {notice && <p className={`admin-notice ${error ? "error" : ""}`} role="status" aria-live="polite">{notice}</p>}
      {tab === "overview" && <><div className="admin-stats"><article><small>পণ্য</small><strong>{products.length}</strong></article><article><small>নতুন অর্ডার</small><strong>{orders.filter((order) => order.status === "pending").length}</strong></article><article><small>ক্যাটাগরি</small><strong>{categories.length}</strong></article><article><small>দোকান</small><strong>{settings.active ? "চালু" : "বন্ধ"}</strong></article></div><section className="admin-card"><h2>শুরু করুন</h2><p>{hasSettings ? "দোকানের তথ্য প্রস্তুত।" : "প্রথমে Store Settings-এ দোকানের তথ্য সংরক্ষণ করুন।"}</p><p>Categories-এ ক্যাটাগরি যোগ করুন, তারপর Products-এ পণ্য দিন। নতুন অর্ডার Orders-এ দেখুন।</p></section></>}
      {tab === "brand" && <section className="admin-card"><h2>দোকানের তথ্য</h2><form key={JSON.stringify(settings)} className="admin-form two-columns" onSubmit={saveBrand}>
        <label>দোকানের নাম (বাংলা)<input name="nameBn" required defaultValue={settings.nameBn} /></label>
        <label>WhatsApp / ফোন<input name="whatsapp" defaultValue={settings.whatsapp} /></label>
        <ImageInput name="logo" label="দোকানের লোগো" currentUrl={settings.logoUrl} onError={(message) => { setNotice(message); setError(true); }} />
        <label>ইমেইল<input type="email" name="email" defaultValue={settings.email} /></label>
        <label>ডেলিভারি চার্জ (৳)<input type="number" name="deliveryCharge" min="0" max="1000" required defaultValue={settings.deliveryCharge} /></label>
        <details className="admin-more"><summary>হোমপেজ ও অন্যান্য সেটিংস</summary><div className="admin-more-grid">
          <label>দোকানের নাম (English)<input name="nameEn" defaultValue={settings.nameEn} /></label>
          <label>হোমপেজ শিরোনাম (বাংলা)<input name="heroTitleBn" defaultValue={settings.heroTitleBn} /></label>
          <label>হোমপেজ শিরোনাম (English)<input name="heroTitleEn" defaultValue={settings.heroTitleEn} /></label>
          <label>হোমপেজ ব্যাজ<input name="promoBadge" defaultValue={settings.promoBadge} /></label>
          <label>হোমপেজের লেখা (বাংলা)<textarea name="taglineBn" defaultValue={settings.taglineBn} /></label>
          <label>হোমপেজের লেখা (English)<textarea name="taglineEn" defaultValue={settings.taglineEn} /></label>
          <ImageInput name="banner" label="হোমপেজ ব্যানার" currentUrl={settings.heroImageUrl} onError={(message) => { setNotice(message); setError(true); }} />
          <label>প্রধান রং<input type="color" name="primaryColor" defaultValue={settings.primaryColor} /></label>
          <label>অতিরিক্ত রং<input type="color" name="accentColor" defaultValue={settings.accentColor} /></label>
          <label className="check"><input type="checkbox" name="active" defaultChecked={settings.active !== false} /> দোকান চালু</label>
        </div></details>
        <button className="admin-primary" disabled={busy}>{busy ? "সংরক্ষণ হচ্ছে..." : "দোকানের তথ্য সংরক্ষণ"}</button>
      </form></section>}
      {tab === "products" && <><section className="admin-card"><h2>{editingProduct ? "পণ্য সম্পাদনা" : "নতুন পণ্য যোগ করুন"}</h2><form key={`${editingProduct?.id || "new"}-${productFormVersion}`} className="admin-form two-columns" onSubmit={saveProduct}>
        <label>পণ্যের নাম (বাংলা) *<input name="bn" required defaultValue={editingProduct?.bn} placeholder="যেমন: সুন্দরবনের মধু" /></label>
        <label>দাম (৳) *<input type="text" inputMode="decimal" name="price" required defaultValue={editingProduct?.price} placeholder="যেমন: ৪৫০ বা 450" /></label>
        <label>ক্যাটাগরি<select name="category" defaultValue={editingProduct?.category || "uncategorized"}><option value="uncategorized">সাধারণ</option>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.bn}</option>)}</select></label>
        <ImageInput name="image" label="পণ্যের ছবি" currentUrl={editingProduct?.imageUrl} onError={(message) => { setNotice(message); setError(true); }} />
        <label className="admin-full">বিবরণ (ঐচ্ছিক)<textarea name="descriptionBn" defaultValue={editingProduct?.descriptionBn} placeholder="পণ্য সম্পর্কে সংক্ষেপে লিখুন" /></label>
        <details className="admin-more"><summary>আরও অপশন</summary><div className="admin-more-grid">
          <label>পণ্যের নাম (English)<input name="en" defaultValue={editingProduct?.en} /></label>
          <label>বিবরণ (English)<textarea name="descriptionEn" defaultValue={editingProduct?.descriptionEn} /></label>
          <label className="check"><input type="checkbox" name="available" defaultChecked={editingProduct?.available !== false} /> স্টকে আছে</label>
          <label className="check"><input type="checkbox" name="active" defaultChecked={editingProduct?.active !== false} /> দোকানে দেখাবে</label>
        </div></details>
        <div className="admin-form-actions admin-full"><button className="admin-primary" disabled={busy}>{busy ? "সংরক্ষণ হচ্ছে..." : editingProduct ? "পরিবর্তন সংরক্ষণ" : "পণ্য যোগ করুন"}</button>{editingProduct && <button type="button" onClick={() => { setEditingProduct(null); setProductFormVersion((version) => version + 1); }}>বাতিল</button>}</div>
      </form></section><section className="admin-card"><h2>পণ্যের তালিকা ({products.length})</h2>{products.length === 0 && <p>এখনো কোনো পণ্য নেই।</p>}{products.map((product) => <div className="admin-list-row" key={product.id}>{product.imageUrl && <img className="admin-list-image" src={product.imageUrl} alt="" />}<strong>{product.bn}</strong><span>{money(product.price)}</span><small>{product.active === false ? "লুকানো" : product.available === false ? "স্টক নেই" : "দেখানো হচ্ছে"}</small><button disabled={busy} onClick={() => { setEditingProduct(product); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button><button disabled={busy} onClick={() => { if (window.confirm(`${product.bn} মুছে ফেলবেন?`)) run(() => dbRequest(`${base}/products/${product.id}`, { method: "DELETE", user }), "পণ্য মুছে ফেলা হয়েছে।"); }}>Delete</button></div>)}</section></>}
      {tab === "categories" && <><section className="admin-card"><h2>{editingCategory ? "ক্যাটাগরি সম্পাদনা" : "নতুন ক্যাটাগরি"}</h2><form key={`${editingCategory?.id || "new"}-${categoryFormVersion}`} className="admin-form two-columns" onSubmit={saveCategory}>
        <label>ক্যাটাগরির নাম (বাংলা) *<input name="bn" required defaultValue={editingCategory?.bn} placeholder="যেমন: মধু" /></label>
        <label>নাম (English, ঐচ্ছিক)<input name="en" defaultValue={editingCategory?.en} /></label>
        <label>ক্যাটাগরির রং (ঐচ্ছিক)<input type="color" name="tone" defaultValue={editingCategory?.tone || "#e8f6ee"} /></label>
        <div className="admin-form-actions admin-full"><button className="admin-primary" disabled={busy}>{busy ? "সংরক্ষণ হচ্ছে..." : editingCategory ? "পরিবর্তন সংরক্ষণ" : "ক্যাটাগরি যোগ করুন"}</button>{editingCategory && <button type="button" onClick={() => { setEditingCategory(null); setCategoryFormVersion((version) => version + 1); }}>বাতিল</button>}</div>
      </form></section><section className="admin-card"><h2>ক্যাটাগরির তালিকা ({categories.length})</h2>{categories.length === 0 && <p>এখনো কোনো ক্যাটাগরি নেই।</p>}{categories.map((cat) => <div className="admin-list-row" key={cat.id}><span className="admin-color" style={{ background: cat.tone }} /><strong>{cat.bn}{cat.en !== cat.bn ? ` / ${cat.en}` : ""}</strong><button disabled={busy} onClick={() => { setEditingCategory(cat); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button><button disabled={busy} onClick={() => { if (window.confirm(`${cat.bn} মুছে ফেলবেন?`)) run(() => dbRequest(`${base}/categories/${cat.id}`, { method: "DELETE", user }), "ক্যাটাগরি মুছে ফেলা হয়েছে।"); }}>Delete</button></div>)}</section></>}
      {tab === "orders" && <section className="admin-card"><h2>অর্ডার ({orders.length})</h2>{orders.length === 0 && <p>এখনো কোনো অর্ডার নেই।</p>}{orders.map((order, index) => <article className="admin-order" key={order.id}><div><strong>অর্ডার {orders.length - index}</strong><small>{order.createdAt}</small></div><p><strong>{order.name}</strong> · {order.phone}</p><p>{order.address}</p><p>{Array.isArray(order.items) ? order.items.map((item) => `${item.bn || item.en} × ${item.qty}`).join(", ") : ""}</p><p>পণ্য: {money(order.subtotal)} · ডেলিভারি: {money(order.shipping)}</p><strong>মোট: {money(order.total)}</strong><label>অর্ডারের অবস্থা<select value={order.status || "pending"} disabled={busy} onChange={(e) => { const status = e.target.value; run(() => dbRequest(`${base}/orders/${order.id}/status`, { method: "PUT", data: status, user }), "অর্ডারের অবস্থা সংরক্ষণ হয়েছে।"); }}><option value="pending">নতুন</option><option value="confirmed">নিশ্চিত</option><option value="shipped">পাঠানো হয়েছে</option><option value="delivered">ডেলিভারি হয়েছে</option><option value="cancelled">বাতিল</option></select></label></article>)}</section>}
    </main>
  </div>;
}
