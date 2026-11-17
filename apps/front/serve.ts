// Sert le front construit par Vite. Toute route inconnue renvoie index.html (application monopage).
const dist = new URL("./dist/", import.meta.url).pathname;

Bun.serve({
  port: 3000,
  development: false,
  error: () => new Response("Erreur interne", { status: 500 }),
  hostname: "0.0.0.0",
  async fetch(req) {
    let path: string;
    try {
      path = decodeURIComponent(new URL(req.url).pathname);
    } catch {
      // Adresse mal encodée (« /%E0 ») : simple 400, jamais de trace d'erreur
      return new Response("Bad Request", { status: 400 });
    }
    if (path === "/health") return Response.json({ ok: true });
    if (!path.includes("..")) {
      const file = Bun.file(dist + path.replace(/^\/+/, ""));
      if (path !== "/" && (await file.exists())) {
        const immutable = path.startsWith("/assets/");
        return new Response(file, { headers: { "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600" } });
      }
    }
    return new Response(Bun.file(dist + "index.html"), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  }
});
console.log("front prêt sur :3000");
