"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Spinner from "@/components/ui/Spinner";

type Contact = {
  name: string;
  email: string;
  phone: string;
  position?: string;
};

type OrgType = "client" | "prospect" | "supplier";

type OrgDto = {
  id: string;
  name: string | null;
  org_type: OrgType | null;
  domain: string | null;
  country: string | null;
  industry: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  alibaba_url: string | null;
  made_in_china_url: string | null;
  indiamart_url: string | null;
  general_email: string | null;
  contacts: Contact[] | null;
  // Legacy fields (for backward compatibility)
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string | null;
  size_tag: string | null;
  source: string | null;
  note: string | null;
  brand: string | null;
  product: string | null;
  quantity: number | null;
  deal_value_usd: number | null;
  last_contact_at: string | null;
  tags: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  title?: string;
  onInquiries?: (org: OrgDto) => void;
};

type Form = {
  name: string;
  domain: string;
  country: string;
  industry: string;
  linkedin_url: string;
  facebook_url: string;
  alibaba_url: string;
  made_in_china_url: string;
  indiamart_url: string;
  general_email: string;
  contacts: Contact[];
  status: string;
  size_tag: string;
  source: string;
  note: string;
  brand: string;
  product: string;
  quantity: string;
  deal_value_usd: string;
  last_contact_at: string;
  tags: string;
};

const emptyContact: Contact = {
  name: "",
  email: "",
  phone: "",
  position: "",
};

const emptyForm: Form = {
  name: "",
  domain: "",
  country: "",
  industry: "",
  linkedin_url: "",
  facebook_url: "",
  alibaba_url: "",
  made_in_china_url: "",
  indiamart_url: "",
  general_email: "",
  contacts: [{ ...emptyContact }],
  status: "",
  size_tag: "",
  source: "",
  note: "",
  brand: "",
  product: "",
  quantity: "",
  deal_value_usd: "",
  last_contact_at: "",
  tags: "",
};

export default function OpenOrganizationModal({ open, onOpenChange, orgId, title = "Organization", onInquiries }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [orgData, setOrgData] = useState<OrgDto | null>(null);

  // enrichment
  const [enriching, setEnriching] = useState(false);
  const [suggestions, setSuggestions] = useState<{ field:string; value:string; confidence?:number; source?:string }[]>([]);
  const [pick, setPick] = useState<Record<number, boolean>>({});
  const [enrichReason, setEnrichReason] = useState<string | null>(null);
  const [enrichTrace, setEnrichTrace] = useState<any | null>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onOpenChange(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  // Load organization data
  useEffect(() => {
    if (!open || !orgId) return;
    setLoading(true);
    fetch(`/api/orgs/${orgId}`)
      .then(r => r.json())
      .then((data: OrgDto) => {
        setOrgData(data);
        
        // Migrate legacy contacts to new format
        let contacts: Contact[] = data.contacts || [];
        if (contacts.length === 0 && (data.contact_name || data.contact_email || data.contact_phone)) {
          contacts = [{
            name: data.contact_name || "",
            email: data.contact_email || "",
            phone: data.contact_phone || "",
            position: "",
          }];
        }
        if (contacts.length === 0) {
          contacts = [{ ...emptyContact }];
        }

        setForm({
          name: data.name || "",
          domain: data.domain || "",
          country: data.country || "",
          industry: data.industry || "",
          linkedin_url: data.linkedin_url || "",
          facebook_url: data.facebook_url || "",
          alibaba_url: data.alibaba_url || "",
          made_in_china_url: data.made_in_china_url || "",
          indiamart_url: data.indiamart_url || "",
          general_email: data.general_email || "",
          contacts,
          status: data.status || "",
          size_tag: data.size_tag || "",
          source: data.source || "",
          note: data.note || "",
          brand: data.brand || "",
          product: data.product || "",
          quantity: data.quantity != null ? String(data.quantity) : "",
          deal_value_usd: data.deal_value_usd != null ? String(data.deal_value_usd) : "",
          last_contact_at: data.last_contact_at || "",
          tags: (data.tags || []).join(", "),
        });
      })
      .catch(() => alert("Failed to load"))
      .finally(() => setLoading(false));
  }, [open, orgId]);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [key]: e.target.value }));
  };

  const setContact = (index: number, field: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => {
      const newContacts = [...f.contacts];
      newContacts[index] = { ...newContacts[index], [field]: e.target.value };
      return { ...f, contacts: newContacts };
    });
  };

  const addContact = () => {
    if (form.contacts.length >= 3) return;
    setForm(f => ({ ...f, contacts: [...f.contacts, { ...emptyContact }] }));
  };

  const removeContact = (index: number) => {
    if (form.contacts.length === 1) return;
    setForm(f => ({ ...f, contacts: f.contacts.filter((_, i) => i !== index) }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        quantity: form.quantity ? Number(form.quantity) : null,
        deal_value_usd: form.deal_value_usd ? Number(form.deal_value_usd) : null,
        tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
        contacts: form.contacts.filter(c => c.name || c.email || c.phone),
      };

      const r = await fetch(`/api/orgs/${orgId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) throw new Error("Save failed");
      router.refresh();
      onOpenChange(false);
    } catch (e: any) {
      alert(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  function normalizeDomainClient(raw?: string): string | null {
    if (!raw) return null;
    try {
      let v = String(raw).trim().toLowerCase();
      if (!v) return null;
      if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname;
      else v = v.split("/")[0];
      return v.replace(/^www\./, "");
    } catch {
      const s = String(raw).trim().toLowerCase();
      return s ? s.replace(/^www\./, "") : null;
    }
  }

  function isEmail(s: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function normalizePhone(raw: string): string | null {
    if (!raw) return null;
    const cleaned = raw.replace(/[^\d+]/g, "");
    return cleaned || null;
  }

  function mapSuggestionToForm(
    s: { field: string; value: string },
    current: Form
  ): { key?: keyof Form; val?: string } | null {
    const field = s.field;
    const value = String(s.value || "").trim();
    const domain = (current.domain || "").toLowerCase();

    if (field === "name") {
      return { key: "name", val: value };
    }
    // Ігноруємо company.displayName (дублікат name)
    if (field === "company.displayName") {
      return null;
    }
    if (field === "domain") {
      const d = normalizeDomainClient(value);
      if (d) return { key: "domain", val: d };
      return null;
    }

    if (field === "general_email" && isEmail(value)) {
      return { key: "general_email", val: value.toLowerCase() };
    }

    if (field === "contact_email" && isEmail(value)) {
      if (!current.contacts[0]?.email) {
        // Will be handled separately
        return null;
      }
      return null;
    }

    if (field === "who.email" && isEmail(value)) {
      if (domain && value.toLowerCase().endsWith("@" + domain)) {
        return { key: "general_email", val: value.toLowerCase() };
      }
      return null;
    }

    if (field === "contact_phone") {
      const p = normalizePhone(value);
      // Will be handled separately for contacts
      return null;
    }

    if (field === "who.phone") return null;

    if (field === "linkedin_url") {
      if (value && value.includes("linkedin.com")) {
        return { key: "linkedin_url", val: value };
      }
      return null;
    }

    if (field === "facebook_url") {
      if (value && value.includes("facebook.com")) {
        return { key: "facebook_url", val: value };
      }
      return null;
    }

    if (field === "country") {
      if (value && value.length === 2) {
        return { key: "country", val: value.toUpperCase() };
      }
      return null;
    }

    if (field === "alibaba_url") {
      if (value && value.includes("alibaba.com")) {
        return { key: "alibaba_url", val: value };
      }
      return null;
    }

    if (field === "made_in_china_url") {
      if (value && value.includes("made-in-china.com")) {
        return { key: "made_in_china_url", val: value };
      }
      return null;
    }

    if (field === "indiamart_url") {
      if (value && value.includes("indiamart.com")) {
        return { key: "indiamart_url", val: value };
      }
      return null;
    }

    return null;
  }

  function canApplySuggestion(s: { field: string; value: string }, current: Form) {
    const m = mapSuggestionToForm(s, current);
    return !!(m && m.key && m.val != null);
  }

  const onFindInfo = async () => {
    try {
      setEnriching(true);
      setSuggestions([]);
      setPick({});
      setEnrichReason(null);
      setEnrichTrace(null);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(orgId ? { "X-Org-ID": String(orgId) } : {}),
      };

      const r = await fetch("/api/enrich/org", {
        method: "POST",
        headers,
        body: JSON.stringify({
          orgId,
          domain: form.domain || null,
          name: form.name || null,
          country: form.country || null,
          email: form.general_email || form.contacts[0]?.email || null,
          phone: form.contacts[0]?.phone || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      const sugg = (j?.suggestions ?? []) as { field:string; value:string; confidence?:number; source?:string }[];
      setSuggestions(sugg);

      setEnrichReason(typeof j?.reason === "string" ? j.reason : null);
      setEnrichTrace(j?.trace || null);

      const pre: Record<number, boolean> = {};
      sugg.forEach((s, i) => {
        const m = mapSuggestionToForm(s, form);
        if (m?.key && !form[m.key]) pre[i] = true;
      });
      setPick(pre);
    } catch (e: any) {
      alert(e?.message || "Enrich failed");
    } finally {
      setEnriching(false);
    }
  };

  const applySelected = () => {
    const updated = { ...form };
    suggestions.forEach((s, i) => {
      if (!pick[i]) return;
      const m = mapSuggestionToForm(s, form);
      if (!m || !m.key || !m.val) return;
      
      // Special handling for contacts
      if (s.field === "contact_email" && isEmail(s.value)) {
        if (!updated.contacts[0]) updated.contacts[0] = { ...emptyContact };
        updated.contacts[0].email = s.value.toLowerCase();
      } else if (s.field === "contact_phone") {
        const p = normalizePhone(s.value);
        if (p) {
          if (!updated.contacts[0]) updated.contacts[0] = { ...emptyContact };
          updated.contacts[0].phone = p;
        }
      } else {
        (updated as any)[m.key] = m.val;
      }
    });
    setForm(updated);
    setSuggestions([]);
    setPick({});
  };

  if (!open) return null;

  const typeColor = (t?: OrgType | string | null) => {
    switch (t) {
      case "client":
        return "bg-emerald-500";
      case "prospect":
        return "bg-amber-500";
      case "supplier":
        return "bg-sky-500";
      default:
        return "bg-zinc-600/70";
    }
  };

  const typeLabel = (t?: OrgType | string | null) => {
    return t || "—";
  };

  return (
    <div className="fixed inset-0 z-[9999]">
      <div className="absolute inset-0 bg-black/60" onClick={() => onOpenChange(false)} />
      
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="relative bg-[#11161d] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Colored left border */}
          <div
            className={`absolute left-0 top-0 h-full w-1 ${typeColor(orgData?.org_type)}`}
            aria-hidden
          />
          
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{title}</h2>
              <span className="px-2 py-0.5 rounded text-xs border border-white/10 bg-white/5">
                {typeLabel(orgData?.org_type)}
              </span>
            </div>
            <div className="flex gap-2">
              {onInquiries && orgData && (
                <button
                  onClick={() => onInquiries(orgData)}
                  className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm"
                >
                  Inquiries
                </button>
              )}
              <button
                onClick={onFindInfo}
                disabled={enriching || loading}
                className="px-4 py-2 rounded-lg border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-50 transition text-sm flex items-center gap-2"
              >
                {enriching && <Spinner />}
                {enriching ? "Searching..." : "Find info"}
              </button>
              <button
                onClick={() => onOpenChange(false)}
                className="px-4 py-2 rounded-lg border border-white/10 hover:bg-white/10 transition"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div>Loading...</div>
            ) : (
              <div className="space-y-6">
                {/* Company Info Section */}
                <Section title="Company Information">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="Company name">
                      <input className="input" value={form.name} onChange={set("name")} />
                    </Field>
                    <Field label="Domain">
                      <input className="input" value={form.domain} onChange={set("domain")} />
                    </Field>
                    <Field label="Country">
                      <input className="input" value={form.country} onChange={set("country")} placeholder="UA, US, RO..." />
                    </Field>
                    <Field label="Industry">
                      <input className="input" value={form.industry} onChange={set("industry")} placeholder="NDT, Healthcare..." />
                    </Field>
                  </div>
                </Section>

                {/* Socials Section */}
                <Section title="Social Media & Platforms">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="LinkedIn URL">
                      <input
                        className="input"
                        placeholder="https://www.linkedin.com/company/..."
                        value={form.linkedin_url}
                        onChange={set("linkedin_url")}
                      />
                    </Field>
                    <Field label="Facebook URL">
                      <input
                        className="input"
                        placeholder="https://www.facebook.com/..."
                        value={form.facebook_url}
                        onChange={set("facebook_url")}
                      />
                    </Field>
                    <Field label="Alibaba URL">
                      <input
                        className="input"
                        placeholder="https://www.alibaba.com/..."
                        value={form.alibaba_url}
                        onChange={set("alibaba_url")}
                      />
                    </Field>
                    <Field label="Made-in-China URL">
                      <input
                        className="input"
                        placeholder="https://www.made-in-china.com/..."
                        value={form.made_in_china_url}
                        onChange={set("made_in_china_url")}
                      />
                    </Field>
                    <Field label="IndiaMART URL">
                      <input
                        className="input"
                        placeholder="https://www.indiamart.com/..."
                        value={form.indiamart_url}
                        onChange={set("indiamart_url")}
                      />
                    </Field>
                  </div>
                </Section>

                {/* Contacts Section */}
                <Section 
                  title="Contacts" 
                  action={
                    form.contacts.length < 3 ? (
                      <button
                        onClick={addContact}
                        className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm"
                      >
                        + Add Contact
                      </button>
                    ) : null
                  }
                >
                  <div className="space-y-4">
                    <Field label="General email">
                      <input className="input" value={form.general_email} onChange={set("general_email")} placeholder="info@company.com" />
                    </Field>

                    {form.contacts.map((contact, idx) => (
                      <div key={idx} className="border border-white/10 rounded-xl p-4 space-y-3 bg-black/20">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-sm">Contact {idx + 1}</h4>
                          {form.contacts.length > 1 && (
                            <button
                              onClick={() => removeContact(idx)}
                              className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/10 transition"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="grid md:grid-cols-2 gap-3">
                          <Field label="Name">
                            <input
                              className="input"
                              value={contact.name}
                              onChange={setContact(idx, "name")}
                              placeholder="John Doe"
                            />
                          </Field>
                          <Field label="Position">
                            <input
                              className="input"
                              value={contact.position || ""}
                              onChange={setContact(idx, "position")}
                              placeholder="Sales Manager"
                            />
                          </Field>
                          <Field label="Email">
                            <input
                              className="input"
                              value={contact.email}
                              onChange={setContact(idx, "email")}
                              placeholder="john@company.com"
                            />
                          </Field>
                          <Field label="Phone">
                            <input
                              className="input"
                              value={contact.phone}
                              onChange={setContact(idx, "phone")}
                              placeholder="+1 234 567 8900"
                            />
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                {/* Business Info Section */}
                <Section title="Business Information">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="Status">
                      <select className="input" value={form.status} onChange={set("status")}>
                        <option value="">—</option>
                        <option value="New">New</option>
                        <option value="In progress">In progress</option>
                        <option value="Won">Won</option>
                        <option value="Lost">Lost</option>
                      </select>
                    </Field>
                    <Field label="Size tag (S/M/L)">
                      <select className="input" value={form.size_tag} onChange={set("size_tag")}>
                        <option value="">—</option>
                        <option value="S">S</option>
                        <option value="M">M</option>
                        <option value="L">L</option>
                      </select>
                    </Field>
                    <Field label="Source">
                      <input className="input" value={form.source} onChange={set("source")} />
                    </Field>
                    <Field label="Tags (comma separated)">
                      <input className="input" value={form.tags} onChange={set("tags")} />
                    </Field>
                    <Field label="Last contact at">
                      <input className="input" placeholder="YYYY-MM-DD or ISO" value={form.last_contact_at} onChange={set("last_contact_at")} />
                    </Field>
                    <Field label="Brand">
                      <input className="input" value={form.brand} onChange={set("brand")} />
                    </Field>
                    <Field label="Product">
                      <input className="input" value={form.product} onChange={set("product")} />
                    </Field>
                    <Field label="Quantity">
                      <input className="input" value={form.quantity} onChange={set("quantity")} />
                    </Field>
                    <Field label="Deal value USD">
                      <input className="input" value={form.deal_value_usd} onChange={set("deal_value_usd")} />
                    </Field>
                  </div>

                  <div className="mt-4">
                    <Field label="Notes">
                      <textarea className="input min-h-[120px]" value={form.note} onChange={set("note")} />
                    </Field>
                  </div>
                </Section>

                {/* Enrichment Results */}
                {enrichReason && (
                  <div className="mt-3 rounded-xl border border-white/10 p-3 text-sm bg-black/20">
                    <div className="text-[var(--muted)] mb-1">
                      {enrichReason === "no_domain_input" && "Not enough input to search. Add company name, email or phone."}
                      {enrichReason === "domain_not_resolved" && "We couldn't resolve the company website from the provided data."}
                      {enrichReason === "pages_unreachable" && "Website found, but common pages (/, about, contact) were unreachable."}
                      {enrichReason === "no_contacts_found" && "Website opened, but no contacts/socials were detected on common pages."}
                      {!["no_domain_input","domain_not_resolved","pages_unreachable","no_contacts_found"].includes(enrichReason) && enrichReason}
                    </div>

                    {enrichTrace && (
                      <div className="text-xs text-[var(--muted)] space-y-1">
                        <div>
                          <span>Resolve:</span>{" "}
                          {Array.isArray(enrichTrace.domainResolution) && enrichTrace.domainResolution.length
                            ? enrichTrace.domainResolution.map((s: any, idx: number) =>
                                `${s.stage}=${s.result}${s.value ? `(${s.value})` : ""}`
                              ).join(" → ")
                            : "none"}
                        </div>
                        <div>
                          <span>Pages:</span> {enrichTrace.pages?.length || 0} fetched
                        </div>
                        <div>
                          <span>Extracted:</span>{" "}
                          emails={enrichTrace.extracted?.emails || 0}, phones={enrichTrace.extracted?.phones || 0},
                          LinkedIn={enrichTrace.extracted?.socials?.linkedin ? "✓" : "✗"},
                          Facebook={enrichTrace.extracted?.socials?.facebook ? "✓" : "✗"},
                          Country={enrichTrace.extracted?.country ? "✓" : "✗"}
                        </div>
                        {enrichTrace.platforms && (
                          <div>
                            <span>Platforms:</span>{" "}
                            {enrichTrace.platforms.searched 
                              ? `Found ${enrichTrace.platforms.resultsCount || 0} results` 
                              : enrichTrace.platforms.error || "Not searched"}
                          </div>
                        )}
                        {enrichTrace.socialMedia && (
                          <div>
                            <span>Social Media:</span>{" "}
                            {enrichTrace.socialMedia.searched 
                              ? `LinkedIn: ${enrichTrace.socialMedia.found?.linkedin ? "✓" : "✗"}, Facebook: ${enrichTrace.socialMedia.found?.facebook ? "✓" : "✗"}` 
                              : enrichTrace.socialMedia.error || "Not searched"}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {suggestions.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="font-semibold text-sm">Suggestions:</div>
                    {suggestions.map((s, i) => {
                      // Іконки для різних джерел
                      const getSourceIcon = (source?: string) => {
                        if (!source) return null;
                        if (source.includes('alibaba')) return '🏪';
                        if (source.includes('made-in-china')) return '🏭';
                        if (source.includes('indiamart')) return '🛒';
                        if (source.includes('linkedin')) return '💼';
                        if (source.includes('facebook')) return '📘';
                        if (source.includes('web')) return '🌐';
                        if (source.includes('page')) return '📄';
                        return '📍';
                      };

                      // Текст джерела
                      const getSourceText = (source?: string) => {
                        if (!source) return '';
                        if (source === 'alibaba-search') return 'Alibaba';
                        if (source === 'alibaba-page') return 'Alibaba page';
                        if (source === 'made-in-china-search') return 'Made-in-China';
                        if (source === 'made-in-china-page') return 'Made-in-China page';
                        if (source === 'indiamart-search') return 'IndiaMART';
                        if (source === 'indiamart-page') return 'IndiaMART page';
                        if (source === 'social-search') return 'Social media';
                        if (source.includes('web')) return 'Web search';
                        if (source.includes('page')) return 'Website';
                        return source;
                      };

                      return (
                        <div key={i} className="flex items-start gap-2 text-sm border border-white/10 rounded-lg p-3 hover:bg-white/5">
                          <input
                            type="checkbox"
                            checked={pick[i] || false}
                            onChange={e => setPick(p => ({ ...p, [i]: e.target.checked }))}
                            disabled={!canApplySuggestion(s, form)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[var(--muted)] min-w-[120px]">{s.field}:</span>
                              <span className="flex-1 break-all">{s.value}</span>
                            </div>
                            {(s as any).source && (
                              <div className="flex items-center gap-1.5 mt-1 text-xs text-[var(--muted)]">
                                <span>{getSourceIcon((s as any).source)}</span>
                                <span>from {getSourceText((s as any).source)}</span>
                              </div>
                            )}
                          </div>
                          {s.confidence != null && (
                            <span className="text-xs text-[var(--muted)] shrink-0">{(s.confidence * 100).toFixed(0)}%</span>
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={applySelected}
                      className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm"
                    >
                      Apply selected
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10">
            <button
              onClick={() => onOpenChange(false)}
              className="px-6 py-2 rounded-lg border border-white/10 hover:bg-white/10 transition"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="px-6 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 transition"
            >
              {saving ? "Saving..." : "OK"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="border border-white/10 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-base">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm mb-1.5 text-[var(--muted)]">{label}</label>
      {children}
    </div>
  );
}

