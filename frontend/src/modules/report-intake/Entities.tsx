// Report Intake — Entities list (independent module, Phase 1).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { riGet, riPost, type RiEntity } from "./types";
import RiShell from "./Shell";

export default function RiEntities() {
  const { t } = useTranslation();
  const [items, setItems] = useState<RiEntity[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", kind: "", person: "", contact: "", deadline: "" });
  const [err, setErr] = useState("");

  const load = () => riGet<{ entities: RiEntity[] }>("/entities").then(d => setItems(d.entities)).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (err === "ri_disabled") return <div className="text-center text-surface-500 py-16">{t("ri_module_disabled")}</div>;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try { await riPost("/entities", form); setShowForm(false); setForm({ name: "", kind: "", person: "", contact: "", deadline: "" }); load(); }
    catch (ex) { setErr(String(ex)); }
  };

  return (
    <RiShell>
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-surface-600">{t("ri_entities")}</h3>
        <button onClick={() => setShowForm(v => !v)} className="text-sm bg-brand text-white px-3 py-1.5 rounded-lg font-semibold">+ {t("ri_entity_name")}</button>
      </div>

      {showForm && (
        <form onSubmit={create} className="bg-white border border-surface-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <input required className="ri-input" placeholder={t("ri_entity_name")} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="ri-input" placeholder={t("ri_entity_kind")} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} />
          <input className="ri-input" placeholder={t("ri_person")} value={form.person} onChange={e => setForm({ ...form, person: e.target.value })} />
          <input className="ri-input" placeholder={t("ri_entity_contact")} value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} />
          <input type="date" className="ri-input" placeholder={t("ri_deadline")} value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
          <button className="ri-btn">{t("ri_accept")}</button>
        </form>
      )}

      <div className="bg-white border border-surface-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-surface-500 border-b border-surface-100">
              <th className="px-4 py-2">{t("ri_entity_name")}</th>
              <th className="px-4 py-2">{t("ri_entity_kind")}</th>
              <th className="px-4 py-2">{t("ri_person")}</th>
              <th className="px-4 py-2">{t("ri_deadline")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map(e => (
              <tr key={e.id} className="border-b border-surface-50">
                <td className="px-4 py-2 font-medium">{e.name}</td>
                <td className="px-4 py-2 text-surface-600">{e.kind || "—"}</td>
                <td className="px-4 py-2 text-surface-600">{e.person || "—"}</td>
                <td className="px-4 py-2 tabular-nums">{e.deadline || "—"}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-surface-400">—</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
    </RiShell>
  );
}
