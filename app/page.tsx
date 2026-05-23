"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { getFirebaseClient } from "@/lib/firebase";

type ProductStatus = "none" | "ultima" | "finito";
type ProductCategory = "cibo" | "bevande" | "pulizia" | "igiene-personale" | "vario";

type Product = {
  id: string;
  name: string;
  status: ProductStatus;
  category?: ProductCategory;
  createdAt?: Timestamp;
};

type ProductGroup = {
  category: ProductCategory;
  label: string;
  products: Product[];
};

const categories: Array<{ id: ProductCategory; label: string }> = [
  { id: "cibo", label: "Cibo" },
  { id: "bevande", label: "Bevande" },
  { id: "pulizia", label: "Pulizia" },
  { id: "igiene-personale", label: "Igiene Personale" },
  { id: "vario", label: "Vario" }
];

const categoryOrder = new Map(categories.map((category, index) => [category.id, index]));

const initialProducts: Array<{ name: string; category: ProductCategory }> = [
  { name: "Latte intero 1L", category: "bevande" },
  { name: "Pane di casa", category: "cibo" },
  { name: "Pasta De Cecco 500g", category: "cibo" },
  { name: "Pomodori pelati", category: "cibo" }
];

function getCategory(product: Product): ProductCategory {
  return product.category && categoryOrder.has(product.category) ? product.category : "vario";
}

function sortByCategory(products: Product[]) {
  return [...products].sort((first, second) => {
    const firstCategory = categoryOrder.get(getCategory(first)) ?? Number.MAX_SAFE_INTEGER;
    const secondCategory = categoryOrder.get(getCategory(second)) ?? Number.MAX_SAFE_INTEGER;

    if (firstCategory !== secondCategory) {
      return firstCategory - secondCategory;
    }

    const firstDate = first.createdAt?.toMillis?.() ?? 0;
    const secondDate = second.createdAt?.toMillis?.() ?? 0;

    if (firstDate !== secondDate) {
      return firstDate - secondDate;
    }

    return first.name.localeCompare(second.name, "it");
  });
}

function groupProducts(products: Product[]): ProductGroup[] {
  const sortedProducts = sortByCategory(products);

  return categories
    .map((category) => ({
      category: category.id,
      label: category.label,
      products: sortedProducts.filter((product) => getCategory(product) === category.id)
    }))
    .filter((group) => group.products.length > 0);
}

export default function Home() {
  const pantryId = process.env.NEXT_PUBLIC_PANTRY_ID || "casa";
  const firebase = useMemo(() => getFirebaseClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [newProduct, setNewProduct] = useState("");
  const [newCategory, setNewCategory] = useState<ProductCategory>("cibo");
  const [boughtIds, setBoughtIds] = useState<Set<string>>(new Set());
  const [shoppingVisible, setShoppingVisible] = useState(false);
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const pantryGroups = useMemo(() => groupProducts(products), [products]);
  const toShop = useMemo(
    () => sortByCategory(products.filter((product) => product.status === "finito" || product.status === "ultima")),
    [products]
  );
  const remaining = toShop.filter((product) => !boughtIds.has(product.id));
  const bought = toShop.filter((product) => boughtIds.has(product.id));
  const remainingGroups = useMemo(() => groupProducts(remaining), [remaining]);
  const boughtGroups = useMemo(() => groupProducts(bought), [bought]);

  useEffect(() => {
    if (!firebase) {
      setAuthReady(true);
      return;
    }

    return onAuthStateChanged(firebase.auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
  }, [firebase]);

  useEffect(() => {
    if (!firebase || !user) {
      setProducts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const productsQuery = query(collection(firebase.db, "pantries", pantryId, "products"), orderBy("createdAt", "asc"));
    return onSnapshot(
      productsQuery,
      (snapshot) => {
        setProducts(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<Product, "id">)
          }))
        );
        setLoading(false);
        setError("");
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoading(false);
      }
    );
  }, [firebase, pantryId, user]);

  async function login() {
    if (!firebase) return;
    setError("");
    await signInWithPopup(firebase.auth, firebase.googleProvider);
  }

  async function addProduct() {
    if (!firebase) return;
    const name = newProduct.trim();
    if (!name) return;

    setNewProduct("");
    await addDoc(collection(firebase.db, "pantries", pantryId, "products"), {
      name,
      category: newCategory,
      status: "none",
      createdAt: serverTimestamp()
    });
  }

  async function seedProducts() {
    if (!firebase) return;
    await Promise.all(
      initialProducts.map((product) =>
        addDoc(collection(firebase.db, "pantries", pantryId, "products"), {
          name: product.name,
          category: product.category,
          status: "none",
          createdAt: serverTimestamp()
        })
      )
    );
  }

  async function setStatus(id: string, currentStatus: ProductStatus, nextStatus: ProductStatus) {
    if (!firebase) return;
    await updateDoc(doc(firebase.db, "pantries", pantryId, "products", id), {
      status: currentStatus === nextStatus ? "none" : nextStatus
    });
  }

  async function removeProduct(id: string) {
    if (!firebase) return;
    const ok = window.confirm("Rimuovere questo prodotto dalla dispensa?");
    if (!ok) return;
    await deleteDoc(doc(firebase.db, "pantries", pantryId, "products", id));
    setBoughtIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function generateList() {
    if (toShop.length === 0) {
      setHint("Nessun prodotto segnato come finito o ultima scorta.");
      setShoppingVisible(false);
      return;
    }

    setHint("");
    setBoughtIds(new Set());
    setShoppingVisible(true);
    window.setTimeout(() => {
      document.getElementById("shoppingPanels")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 40);
  }

  function markBought(id: string) {
    setBoughtIds((current) => new Set(current).add(id));
  }

  async function endShopping() {
    if (!firebase) return;
    await Promise.all(
      Array.from(boughtIds).map((id) =>
        updateDoc(doc(firebase.db, "pantries", pantryId, "products", id), {
          status: "none"
        })
      )
    );
    setBoughtIds(new Set());
    setShoppingVisible(false);
    setHint("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!authReady) {
    return <main className="container">Caricamento...</main>;
  }

  if (!firebase) {
    return (
      <main className="container auth-screen">
        <section className="login-panel">
          <i className="ti ti-settings" />
          <h1>Firebase da configurare</h1>
          <p>Crea `.env.local` partendo da `.env.local.example` e inserisci i dati della tua web app Firebase.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="container auth-screen">
        <section className="login-panel">
          <i className="ti ti-shopping-cart" />
          <h1>La mia Dispensa</h1>
          <p>Accedi con Google per condividere prodotti e lista della spesa in tempo reale.</p>
          <button className="btn btn-primary btn-generate" onClick={login}>
            <i className="ti ti-brand-google" />
            Accedi con Google
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <header>
        <div>
          <h1>
            <i className="ti ti-shopping-cart" />
            La mia Dispensa
          </h1>
          <p>Gestisci i prodotti di casa e genera la lista della spesa condivisa.</p>
        </div>
        <button className="btn" onClick={() => signOut(firebase.auth)}>
          <i className="ti ti-logout" />
          Esci
        </button>
      </header>

      {error ? (
        <div className="notice danger">
          <strong>Firebase non lascia leggere o scrivere.</strong>
          <span>Controlla configurazione, regole Firestore e UID autorizzati.</span>
          <code>{user.uid}</code>
        </div>
      ) : null}

      <section className="card">
        <p className="section-title">Aggiungi un prodotto</p>
        <div className="add-row">
          <input
            type="text"
            value={newProduct}
            onChange={(event) => setNewProduct(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addProduct();
            }}
            placeholder="es. mozzarella Vallelata 100g"
          />
          <select
            className="category-select"
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value as ProductCategory)}
            aria-label="Categoria prodotto"
          >
            {categories.map((category) => (
              <option value={category.id} key={category.id}>
                {category.label}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={() => void addProduct()}>
            <i className="ti ti-plus" />
            Aggiungi alla dispensa
          </button>
        </div>
      </section>

      <section className="card">
        <p className="section-title">Prodotti in dispensa</p>
        <div className="pantry-list">
          {loading ? <p className="empty-state">Caricamento prodotti...</p> : null}

          {!loading && products.length === 0 ? (
            <div className="empty-block">
              <p className="empty-state">Nessun prodotto in dispensa.</p>
              <button className="btn" onClick={() => void seedProducts()}>
                <i className="ti ti-sparkles" />
                Inserisci esempi iniziali
              </button>
            </div>
          ) : null}

          {pantryGroups.map((group) => (
            <div className="category-group" key={group.category}>
              <p className="category-title">{group.label}</p>
              <div className="category-list">
                {group.products.map((product) => (
                  <div className="product-row" key={product.id}>
                    <span className="product-name">{product.name}</span>
                    <div className="check-group">
                      <button
                        className={`check-btn${product.status === "ultima" ? " ultima" : ""}`}
                        onClick={() => void setStatus(product.id, product.status, "ultima")}
                      >
                        <i className="ti ti-alert-triangle" />
                        Ultima scorta
                      </button>
                      <button
                        className={`check-btn${product.status === "finito" ? " finito" : ""}`}
                        onClick={() => void setStatus(product.id, product.status, "finito")}
                      >
                        <i className="ti ti-x" />
                        Finito
                      </button>
                      <button className="btn btn-danger btn-small" onClick={() => void removeProduct(product.id)}>
                        <i className="ti ti-trash" />
                        Elimina
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <hr className="divider" />

      <div className="generate-bar">
        <button className="btn btn-primary btn-generate" onClick={generateList}>
          <i className="ti ti-list-check" />
          Genera lista spesa
        </button>
        <span className="generate-hint">{hint}</span>
      </div>

      <section className={`panels${shoppingVisible ? "" : " shopping-hidden"}`} id="shoppingPanels">
        <div className="panel">
          <div className="panel-title">
            <i className="ti ti-alert-circle danger-icon" />
            Da comprare
          </div>
          {remaining.length === 0 ? (
            <p className="empty-state success-text">
              <i className="ti ti-circle-check" /> Tutto comprato!
            </p>
          ) : (
            remainingGroups.map((group) => (
              <div className="shopping-category-group" key={group.category}>
                <p className="category-title">{group.label}</p>
                {group.products.map((product) => (
                  <div
                    className={`shopping-item ${product.status === "finito" ? "finito-item" : "ultima-item"}`}
                    key={product.id}
                  >
                    <span className="item-label">{product.name}</span>
                    <span className={`badge ${product.status === "finito" ? "badge-r" : "badge-y"}`}>
                      {product.status === "finito" ? "Finito" : "Ultima scorta"}
                    </span>
                    <button className="btn-comprato" onClick={() => markBought(product.id)}>
                      <i className="ti ti-check" />
                      Comprato
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="panel">
          <div className="panel-title">
            <i className="ti ti-circle-check success-icon" />
            Nel carrello
          </div>
          {bought.length === 0 ? (
            <p className="empty-state">Nessun prodotto ancora comprato</p>
          ) : (
            boughtGroups.map((group) => (
              <div className="shopping-category-group" key={group.category}>
                <p className="category-title">{group.label}</p>
                {group.products.map((product) => (
                  <div className="shopping-item bought" key={product.id}>
                    <span className="item-label">{product.name}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="footer-panel">
          <button className="btn" onClick={() => void endShopping()}>
            <i className="ti ti-refresh" />
            Fine spesa, reimposta
          </button>
        </div>
      </section>
    </main>
  );
}
