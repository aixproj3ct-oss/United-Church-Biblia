// Canal en tiempo real entre la tablet y la pantalla, por ntfy.sh (gratuito, con CORS y SSE).
// fetch y EventSource se inyectan para probar sin red.
import { leer } from "./mensajes.js";

export function crearCanal(tema, { fetch: f, EventSource: ES, base = "https://ntfy.sh" } = {}) {
  const url = `${base}/${tema}`;
  const pedir = (...a) => (f ?? globalThis.fetch)(...a);
  return {
    async publicar(msg) {
      const r = await pedir(url, { method: "POST", body: JSON.stringify(msg) });
      if (!r.ok) throw new Error("ntfy " + r.status);
    },
    escuchar(alRecibir, alEstado = () => {}) {
      const es = new (ES ?? globalThis.EventSource)(`${url}/sse`);
      es.onopen = () => alEstado(true);
      es.onerror = () => alEstado(false);
      es.onmessage = ev => {
        let d;
        try { d = JSON.parse(ev.data); } catch { return; }
        if (d?.event !== "message") return;
        const m = leer(d.message);
        if (m) alRecibir(m);
      };
      return () => es.close();
    },
    async ultimo(de) {
      try {
        const r = await pedir(`${url}/json?poll=1&since=12h`);
        if (!r.ok) return null;
        let mejor = null;
        for (const linea of (await r.text()).split("\n")) {
          let d;
          try { d = JSON.parse(linea); } catch { continue; }
          const m = d?.event === "message" ? leer(d.message) : null;
          if (m && m.de === de && (!mejor || m.t > mejor.t)) mejor = m;
        }
        return mejor;
      } catch { return null; }
    },
  };
}
