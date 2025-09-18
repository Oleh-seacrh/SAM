"use client";
import { useState, useEffect } from "react";

export default function SocialsInput({
  initialLinkedin = "",
  initialFacebook = "",
  onChange
}: {
  initialLinkedin?: string;
  initialFacebook?: string;
  onChange: (v: { linkedin_url: string; facebook_url: string }) => void;
}) {
  const [linkedin, setLinkedin] = useState(initialLinkedin);
  const [facebook, setFacebook] = useState(initialFacebook);

  useEffect(() => {
    onChange({ linkedin_url: linkedin.trim(), facebook_url: facebook.trim() });
  }, [linkedin, facebook, onChange]);

  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">LinkedIn (company)</label>
      <input
        type="url"
        placeholder="https://www.linkedin.com/company/acme"
        className="border rounded px-3 py-2"
        value={linkedin}
        onChange={(e) => setLinkedin(e.target.value)}
      />
      <label className="text-sm font-medium mt-2">Facebook (page)</label>
      <input
        type="url"
        placeholder="https://www.facebook.com/acme"
        className="border rounded px-3 py-2"
        value={facebook}
        onChange={(e) => setFacebook(e.target.value)}
      />
    </div>
  );
}
