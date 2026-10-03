"use client";

import { useEffect, useMemo, useState } from "react";
import {
  orderEmailEvents,
  previewOrderEmailCopy,
  type OrderEmailEvent,
  type OrderEmailTemplate,
} from "@/lib/admin/order-email-templates";

type EditorResponse = { templates?: OrderEmailTemplate[]; template?: OrderEmailTemplate; error?: string };
type EditField = "enabled" | "subjectOverride" | "titleOverride" | "introOverride" | "closingOverride";

const editableFields: EditField[] = ["enabled", "subjectOverride", "titleOverride", "introOverride", "closingOverride"];

function changed(left: OrderEmailTemplate, right: OrderEmailTemplate) {
  return editableFields.some((field) => left[field] !== right[field]);
}

async function requestTemplates() {
  const response = await fetch("/api/admin/order-emails", { cache: "no-store", credentials: "same-origin" });
  const body = await response.json() as EditorResponse;
  if (!response.ok || !Array.isArray(body.templates)) throw new Error(body.error || "Order email settings could not be loaded.");
  return body.templates;
}

export function OrderEmailEditor() {
  const [saved, setSaved] = useState<OrderEmailTemplate[] | null>(null);
  const [drafts, setDrafts] = useState<OrderEmailTemplate[]>([]);
  const [selected, setSelected] = useState<OrderEmailEvent>("merchant_new_order");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const templates = await requestTemplates();
      setSaved(templates);
      setDrafts(templates);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Order email settings could not be loaded.");
    }
  };

  useEffect(() => {
    let active = true;
    void requestTemplates().then((templates) => {
      if (active) { setSaved(templates); setDrafts(templates); }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Order email settings could not be loaded.");
    });
    return () => { active = false; };
  }, []);

  const template = drafts.find((item) => item.eventType === selected);
  const savedTemplate = saved?.find((item) => item.eventType === selected);
  const event = orderEmailEvents.find((item) => item.eventType === selected)!;
  const dirty = Boolean(template && savedTemplate && changed(template, savedTemplate));
  const preview = useMemo(() => template ? previewOrderEmailCopy(template) : null, [template]);

  const edit = (field: EditField, value: boolean | string) => {
    setMessage("");
    setError("");
    setDrafts((current) => current.map((row) => row.eventType === selected ? { ...row, [field]: value } : row));
  };

  const save = async (eventObject: React.FormEvent<HTMLFormElement>) => {
    eventObject.preventDefault();
    if (!template || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/order-emails", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: template.eventType,
          enabled: template.enabled,
          subjectOverride: template.subjectOverride?.trim() || null,
          titleOverride: template.titleOverride?.trim() || null,
          introOverride: template.introOverride?.trim() || null,
          closingOverride: template.closingOverride?.trim() || null,
          revision: template.revision,
        }),
      });
      const body = await response.json() as EditorResponse;
      if (!response.ok || !body.template) throw new Error(body.error || "The email could not be saved.");
      const update = (current: OrderEmailTemplate[]) => current.map((row) => row.eventType === body.template!.eventType ? body.template! : row);
      setSaved((current) => current ? update(current) : current);
      setDrafts(update);
      setMessage(`${event.label} settings saved.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The email could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="admin-order-email-editor" aria-label="Order email settings">
    <div className="admin-page-heading"><div><p className="eyebrow">Commerce settings</p><h1>Order emails</h1><p>Edit each automated order message and decide whether it sends. Existing copy stays in place until you save an override.</p></div></div>
    <p className="admin-order-email-guidance">Order numbers, purchased items, totals, addresses, tracking details, and the staff-written note are filled from each order automatically. This editor changes the subject and surrounding words only. Use <code>{"{{orderNumber}}"}</code> where the order number should appear.</p>
    {error && <p className="admin-commerce-notice" role="alert">{error} <button className="admin-order-email-retry" onClick={() => { setError(""); setMessage(""); void load(); }} type="button">Reload settings</button></p>}
    {message && <p className="notice success" role="status">{message}</p>}
    {!saved ? <div className="admin-panel"><p role="status">Loading order emails…</p></div> :
      <div className="admin-order-email-layout">
        <nav className="admin-panel admin-order-email-list" aria-label="Order email types">
          <h2>Messages</h2>
          {orderEmailEvents.map((item) => {
            const row = drafts.find((draft) => draft.eventType === item.eventType);
            const original = saved.find((draft) => draft.eventType === item.eventType);
            return <button aria-current={selected === item.eventType ? "page" : undefined} className={selected === item.eventType ? "is-selected" : ""} key={item.eventType} onClick={() => { setSelected(item.eventType); setError(""); setMessage(""); }} type="button">
              <span><strong>{item.label}</strong><small>{item.audience}</small></span>
              <span className="admin-order-email-flags">{row && original && changed(row, original) && <span className="is-unsaved">Unsaved</span>}<span className={row?.enabled ? "is-on" : "is-off"}>{row?.enabled ? "On" : "Off"}</span></span>
            </button>;
          })}
        </nav>
        {template && preview && <div className="admin-order-email-main">
          <form className="admin-panel admin-order-email-form" onSubmit={save}>
            <div className="admin-panel-heading"><div><p className="eyebrow">{event.audience} message</p><h2>{event.label}</h2><p>{event.description}</p></div></div>
            <label className="admin-order-email-switch"><input checked={template.enabled} disabled={busy} onChange={(eventObject) => edit("enabled", eventObject.target.checked)} type="checkbox" /><span><strong>Send this email</strong><small>{template.enabled ? "This message is on." : "This message is off."}</small></span></label>
            <div className="admin-order-email-fields">
              <label className="field">Subject<input className="input" disabled={busy} maxLength={180} onChange={(eventObject) => edit("subjectOverride", eventObject.target.value)} placeholder={event.defaults.subject} value={template.subjectOverride || ""} /><small>Leave blank to use the existing subject.</small></label>
              <label className="field">Heading<input className="input" disabled={busy} maxLength={160} onChange={(eventObject) => edit("titleOverride", eventObject.target.value)} placeholder={event.defaults.title} value={template.titleOverride || ""} /><small>Leave blank to use the existing heading.</small></label>
              <label className="field">Introduction<textarea className="input" disabled={busy} maxLength={1000} onChange={(eventObject) => edit("introOverride", eventObject.target.value)} placeholder={event.eventType === "customer_order_completed" ? "Existing wording adapts to pickup or shipping." : event.defaults.intro || "Optional introduction before the staff note."} rows={3} value={template.introOverride || ""} /><small>{event.eventType === "customer_order_completed" ? "Leave blank to keep the pickup or shipping wording." : "Leave blank to use the existing introduction."}</small></label>
              <label className="field">Closing<textarea className="input" disabled={busy} maxLength={1000} onChange={(eventObject) => edit("closingOverride", eventObject.target.value)} placeholder={event.defaults.closing} rows={3} value={template.closingOverride || ""} /><small>Leave blank to use the existing closing.</small></label>
            </div>
            <div className="admin-order-email-save"><small>{template.updatedAt ? `Last saved ${new Date(template.updatedAt).toLocaleString("en-CA")}` : "Using original settings"}</small><button className="btn btn-gold" disabled={!dirty || busy} type="submit">{busy ? "Saving…" : "Save this email"}</button></div>
          </form>
          <section className="admin-panel admin-order-email-preview" aria-label="Sample email preview"><div className="admin-panel-heading"><div><p className="eyebrow">Example order #10482</p><h2>Preview</h2></div></div><dl><div><dt>Subject</dt><dd>{preview.subject}</dd></div><div><dt>Heading</dt><dd>{preview.title}</dd></div><div><dt>Introduction</dt><dd>{preview.intro || <em>No standard introduction; the staff note appears here.</em>}</dd></div><div><dt>Order details</dt><dd><em>{selected === "customer_order_note" ? "The staff-written note appears here." : "The purchased items and order details appear here."}</em></dd></div><div><dt>Closing</dt><dd>{preview.closing}</dd></div></dl>{selected === "customer_order_completed" && !template.introOverride && <p className="help">This example shows shipping. The original pickup wording will continue to adapt to the order.</p>}</section>
        </div>}
      </div>}
  </section>;
}
